import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
    }
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  const block = content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Claude 응답에서 텍스트를 찾을 수 없습니다.');
  }
  return block.text;
}

/** 텍스트 메시지 전송 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string },
): Promise<string> {
  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: options?.model || config.claudeModel,
    max_tokens: options?.maxTokens || 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return extractText(response.content);
}

/** Vision 메시지 전송 (이미지 + 텍스트) */
export async function askClaudeWithImage(
  systemPrompt: string,
  imageBase64: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; mediaType?: string },
): Promise<string> {
  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: options?.model || config.claudeModel,
    max_tokens: options?.maxTokens || 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (options?.mediaType || 'image/jpeg') as 'image/jpeg',
              data: imageBase64,
            },
          },
          { type: 'text', text: userMessage },
        ],
      },
    ],
  });
  return extractText(response.content);
}

/** 두 이미지 비교 (매칭용) */
export async function compareImages(
  systemPrompt: string,
  image1Base64: string,
  image2Base64: string,
  userMessage: string,
  options?: { maxTokens?: number },
): Promise<string> {
  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: config.claudeModel,
    max_tokens: options?.maxTokens || 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: image1Base64,
            },
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: image2Base64,
            },
          },
          { type: 'text', text: userMessage },
        ],
      },
    ],
  });
  return extractText(response.content);
}
