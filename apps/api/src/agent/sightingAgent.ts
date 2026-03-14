import type Anthropic from '@anthropic-ai/sdk';
import { AGENT_MAX_TOOL_ROUNDS, ERROR_CODES } from '@findthem/shared';
import type { AgentResponse, AgentToolCall, ChatPlatform, SubjectType } from '@findthem/shared';
import { getClaudeClient } from '../ai/claudeClient.js';
import { config } from '../config.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import { ApiError } from '@findthem/shared';
import { loadAsClaudeMessages, saveRound } from './conversationManager.js';
import { SIGHTING_AGENT_SYSTEM_PROMPT } from './systemPrompt.js';
import { SIGHTING_TOOLS, dispatchTool } from './tools/index.js';

const log = createLogger('sightingAgent');
const CLAUDE_TIMEOUT_MS = 30_000;

export interface AgentContext {
  sessionId: string;
  userId?: string;
  platform: ChatPlatform;
  reportId?: string;
}

export class SightingAgent {
  private readonly maxToolRounds = AGENT_MAX_TOOL_ROUNDS;

  async processMessage(
    ctx: AgentContext,
    userMessage: string,
    photoUrl?: string,
  ): Promise<AgentResponse> {
    // 입력 검증
    if (userMessage.length > 2000) {
      throw new ApiError(400, ERROR_CODES.MESSAGE_TOO_LONG);
    }

    const claude = getClaudeClient();

    // 1. 기존 대화 히스토리 로드
    const history = await loadAsClaudeMessages(ctx.sessionId);

    // 세션 메시지 수 제한
    if (history.length > 50) {
      throw new ApiError(400, ERROR_CODES.SESSION_OVERFLOW);
    }

    // 2. 새 사용자 메시지 구성
    let newUserContent: Anthropic.Messages.MessageParam['content'];

    if (photoUrl) {
      try {
        const { imageService } = await import('../services/imageService.js');
        const base64 = await imageService.toBase64(photoUrl);
        newUserContent = [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: userMessage },
        ];
      } catch {
        newUserContent = userMessage;
      }
    } else {
      newUserContent = userMessage;
    }

    const messages: Anthropic.Messages.MessageParam[] = [
      ...history,
      { role: 'user', content: newUserContent },
    ];

    // 3. Claude tool_use 루프
    let finalText = '';
    const toolCalls: AgentToolCall[] = [];
    let photoAnalysis: AgentResponse['photoAnalysis'];
    let similarReports: AgentResponse['similarReports'];
    let sightingId: string | undefined;
    let completed = false;

    for (let round = 0; round < this.maxToolRounds; round++) {
      let response: Anthropic.Messages.Message;

      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), CLAUDE_TIMEOUT_MS);
        try {
          response = await claude.messages.create(
            {
              model: config.claudeModel,
              max_tokens: 1024,
              system: SIGHTING_AGENT_SYSTEM_PROMPT,
              tools: SIGHTING_TOOLS,
              messages,
            },
            { signal: abort.signal },
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        log.error({ err }, 'Claude API 호출 실패');
        return {
          text: '죄송합니다. 일시적으로 서비스에 문제가 있습니다. 잠시 후 다시 시도해주세요.',
          completed: false,
          toolsUsed: [],
        };
      }

      // stop_reason 확인
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
        finalText = extractText(response.content);
        break;
      }

      if (response.stop_reason !== 'tool_use') {
        finalText = extractText(response.content);
        break;
      }

      // tool_use 블록 처리
      const assistantMessage: Anthropic.Messages.MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      messages.push(assistantMessage);

      // 텍스트 추출 (tool_use 사이의 중간 텍스트)
      const intermediateText = extractText(response.content);

      const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const toolInput = block.input as Record<string, unknown>;
        let toolResult: unknown;

        try {
          toolResult = await dispatchTool(block.name, toolInput, ctx.userId);
        } catch (err) {
          log.error({ err, tool: block.name }, '도구 실행 실패');
          toolResult = { error: err instanceof Error ? err.message : '도구 실행 중 오류가 발생했습니다' };
        }

        toolCalls.push({ name: block.name, input: toolInput, result: (toolResult ?? {}) as Record<string, unknown> });

        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult),
        });

        // 도구별 특수 처리
        if (block.name === 'analyze_photo') {
          photoAnalysis = toolResult as AgentResponse['photoAnalysis'];
        }

        if (block.name === 'search_reports') {
          const reportsResult = toolResult as { reports: { id: string; name: string; features: string; lastSeenAddress: string; photoUrl?: string }[] };
          similarReports = reportsResult.reports.map((r) => ({
            id: r.id,
            name: r.name,
            features: r.features,
            photoUrl: r.photoUrl,
            similarity: '유사 신고',
          }));
        }

        if (block.name === 'save_sighting') {
          const saveResult = toolResult as { sightingId: string; message: string };
          sightingId = saveResult.sightingId;
          completed = true;
        }
      }

      messages.push({ role: 'user', content: toolResultContents });

      // 마지막 라운드가 아니면 계속
      if (round === this.maxToolRounds - 1) {
        finalText = intermediateText || '처리 중 오류가 발생했습니다.';
      }
    }

    // finalText가 비어있으면 마지막 어시스턴트 메시지에서 추출 시도
    if (!finalText) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant') {
          if (typeof msg.content === 'string') {
            finalText = msg.content;
          } else if (Array.isArray(msg.content)) {
            finalText = extractText(msg.content as Anthropic.Messages.ContentBlock[]);
          }
          if (finalText) break;
        }
      }
    }

    // 4. DB 저장
    await saveRound(ctx.sessionId, userMessage, finalText, photoUrl, toolCalls);

    // 5. save_sighting 호출됐으면 세션 완료 처리
    if (completed) {
      await prisma.chatSession.update({
        where: { id: ctx.sessionId },
        data: { status: 'COMPLETED' },
      });
    }

    return {
      text: finalText,
      completed,
      toolsUsed: toolCalls.map((tc) => tc.name),
      photoAnalysis,
      similarReports,
      sightingId,
    };
  }
}

export const sightingAgent = new SightingAgent();

function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === 'text') return block.text;
  }
  return '';
}
