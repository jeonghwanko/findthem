import type Anthropic from '@anthropic-ai/sdk';
import { AGENT_MAX_HISTORY_MESSAGES, type AgentToolCall } from '@findthem/shared';
import { Prisma } from '@prisma/client'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';

// ChatMessage.metadata 타입
interface MessageMetadata {
  photoUrl?: string;
  toolCalls?: AgentToolCall[];
}

/**
 * DB ChatMessage 레코드를 Claude Messages 형식으로 변환하여 반환.
 * 최근 AGENT_MAX_HISTORY_MESSAGES(40)개만 로드.
 */
export async function loadAsClaudeMessages(
  sessionId: string,
): Promise<Anthropic.Messages.MessageParam[]> {
  const messages = (
    await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: AGENT_MAX_HISTORY_MESSAGES,
    })
  ).reverse();

  const result: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    const meta = (msg.metadata ?? {}) as MessageMetadata;

    if (msg.role === 'user') {
      if (meta.photoUrl) {
        // 이미지 content block 포함
        try {
          const base64 = await imageService.toBase64(meta.photoUrl);
          result.push({
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg' as const, data: base64 },
              },
              { type: 'text', text: msg.content },
            ],
          });
        } catch {
          // 이미지 로드 실패 시 텍스트만
          result.push({ role: 'user', content: msg.content });
        }
      } else {
        result.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      if (meta.toolCalls && meta.toolCalls.length > 0) {
        // tool_use blocks 복원 (assistant) + tool_result blocks (user)
        const assistantContent: Anthropic.Messages.MessageParam['content'] = [
          { type: 'text', text: msg.content },
          ...meta.toolCalls.map(
            (tc): Anthropic.Messages.ToolUseBlockParam => ({
              type: 'tool_use',
              id: `tool_${tc.name}_${Date.now()}`,
              name: tc.name,
              input: tc.input,
            }),
          ),
        ];

        result.push({ role: 'assistant', content: assistantContent });

        // 각 tool_use에 대한 tool_result를 user 메시지로 추가
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = meta.toolCalls.map(
          (tc, idx) => ({
            type: 'tool_result' as const,
            tool_use_id: `tool_${tc.name}_${Date.now()}_${idx}`,
            content: JSON.stringify(tc.result),
          }),
        );
        result.push({ role: 'user', content: toolResults });
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  return result;
}

/**
 * 한 라운드(사용자 메시지 + 어시스턴트 응답)를 DB에 저장.
 */
export async function saveRound(
  sessionId: string,
  userMessage: string,
  assistantText: string,
  photoUrl?: string,
  toolCalls?: AgentToolCall[],
): Promise<void> {
  const userMeta: Prisma.InputJsonValue | undefined = photoUrl
    ? (JSON.parse(JSON.stringify({ photoUrl })) as Prisma.InputJsonValue)
    : undefined;

  const assistantMeta: Prisma.InputJsonValue | undefined =
    toolCalls && toolCalls.length > 0
      ? (JSON.parse(JSON.stringify({ toolCalls })) as Prisma.InputJsonValue)
      : undefined;

  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId,
        role: 'user',
        content: userMessage,
        metadata: userMeta,
      },
      {
        sessionId,
        role: 'assistant',
        content: assistantText,
        metadata: assistantMeta,
      },
    ],
  });
}
