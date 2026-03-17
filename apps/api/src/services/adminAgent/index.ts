import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { getClaudeClient } from '../../ai/aiClient.js';
import { getModelName } from '../../ai/aiSettings.js';
import { config } from '../../config.js';
import { prisma } from '../../db/client.js';
import { ApiError, ADMIN_AGENT_MAX_TURNS, ADMIN_AGENT_MAX_TOKENS, ERROR_CODES } from '@findthem/shared';
import { createLogger } from '../../logger.js';
import { createAuditLog } from '../auditLogService.js';
import { ADMIN_AGENT_SYSTEM_PROMPT } from './systemPrompt.js';
import { ADMIN_TOOL_DEFINITIONS } from './toolDefinitions.js';
import { TOOL_HANDLERS, WRITE_TOOLS } from './tools/index.js';

const log = createLogger('adminAgent');
const CLAUDE_TIMEOUT_MS = 30_000;

// ── 헬퍼 ──

function extractTargetType(toolName: string): string {
  if (toolName.includes('report')) return 'REPORT';
  if (toolName.includes('match')) return 'MATCH';
  if (toolName.includes('user') || toolName === 'block_user') return 'USER';
  if (toolName.includes('job')) return 'JOB';
  return 'SYSTEM';
}

function extractTargetId(input: Record<string, unknown>): string {
  const id = input.reportId ?? input.matchId ?? input.userId ?? input.jobId;
  return typeof id === 'string' ? id : 'unknown';
}

// ── AdminAgentService ──

export class AdminAgentService {
  async chat(
    sessionId: string | undefined,
    userMessage: string,
  ): Promise<{
    sessionId: string;
    reply: string;
    toolResults?: { tool: string; input: unknown; output: unknown }[];
  }> {
    // 입력 검증
    if (userMessage.length > 2000) {
      throw new ApiError(400, ERROR_CODES.MESSAGE_TOO_LONG);
    }

    // 1. 세션 로드 또는 생성
    let session: { id: string; messages: Prisma.JsonValue };

    if (sessionId) {
      const found = await prisma.adminAgentSession.findUnique({
        where: { id: sessionId },
        select: { id: true, messages: true },
      });
      if (!found) throw new ApiError(404, ERROR_CODES.SESSION_NOT_FOUND);
      session = found;
    } else {
      session = await prisma.adminAgentSession.create({
        data: { messages: [] },
        select: { id: true, messages: true },
      });
    }

    // 2. 메시지 히스토리 구성
    const history = session.messages as unknown as Anthropic.Messages.MessageParam[];

    // 세션 메시지 수 제한
    if (history.length > 100) {
      throw new ApiError(400, ERROR_CODES.SESSION_OVERFLOW);
    }

    const messages: Anthropic.Messages.MessageParam[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    // 3. Claude tool_use 루프
    const claude = await getClaudeClient();
    const model = await getModelName('admin') ?? config.claudeModel;
    const toolResults: { tool: string; input: unknown; output: unknown }[] = [];
    let response!: Anthropic.Messages.Message;
    let turns = 0;

    while (turns < ADMIN_AGENT_MAX_TURNS) {
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), CLAUDE_TIMEOUT_MS);
        try {
          response = await claude.messages.create(
            {
              model,
              max_tokens: ADMIN_AGENT_MAX_TOKENS,
              system: ADMIN_AGENT_SYSTEM_PROMPT,
              tools: ADMIN_TOOL_DEFINITIONS,
              messages,
            },
            { signal: abort.signal },
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        log.error({ err }, 'Claude API call failed');
        return {
          sessionId: session.id,
          reply: '일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
          toolResults: undefined,
        };
      }

      if (response.stop_reason !== 'tool_use') break;

      // assistant 응답을 히스토리에 추가
      messages.push({ role: 'assistant', content: response.content });

      // tool_use 블록 처리
      const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const handler = TOOL_HANDLERS[block.name];
        let result: unknown;

        try {
          result = handler
            ? await handler(block.input as Record<string, unknown>)
            : { error: `Unknown tool: ${block.name}` };
        } catch (e: unknown) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }

        toolResults.push({ tool: block.name, input: block.input, output: result });

        // WRITE 도구 감사 로그 기록
        if (WRITE_TOOLS.has(block.name)) {
          await createAuditLog({
            action: block.name.toUpperCase(),
            targetType: extractTargetType(block.name),
            targetId: extractTargetId(block.input as Record<string, unknown>),
            detail: { input: block.input, output: result },
            source: 'AGENT',
            agentSessionId: session.id,
          });
        }

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResultBlocks });
      turns++;
    }

    // 4. 텍스트 응답 추출
    const reply = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    // 5. 세션 업데이트 (최근 40개 메시지로 트리밍)
    const AGENT_MAX_HISTORY_MESSAGES = 40;
    const trimmedMessages = messages.slice(-AGENT_MAX_HISTORY_MESSAGES);

    await prisma.adminAgentSession.update({
      where: { id: session.id },
      data: {
        messages: trimmedMessages as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    return {
      sessionId: session.id,
      reply,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    };
  }
}

export const adminAgentService = new AdminAgentService();
