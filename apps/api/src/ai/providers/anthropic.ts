import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import type { AiProvider, AiResponse } from './types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
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
    throw new Error('Anthropic 응답에서 텍스트를 찾을 수 없습니다.');
  }
  return block.text;
}

export const anthropicProvider: AiProvider = {
  name: 'anthropic',

  async ask(systemPrompt, userMessage, options): Promise<AiResponse> {
    const claude = getClient();
    const model = options?.model ?? config.claudeModel;
    const startMs = Date.now();
    const response = await claude.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return {
      text: extractText(response.content),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
      provider: 'anthropic',
      latencyMs: Date.now() - startMs,
    };
  },

  async askWithImage(systemPrompt, imageBase64, userMessage, options): Promise<AiResponse> {
    const claude = getClient();
    const model = options?.model ?? config.claudeModel;
    const startMs = Date.now();
    const response = await claude.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (options?.mediaType ?? 'image/jpeg') as 'image/jpeg',
                data: imageBase64,
              },
            },
            { type: 'text', text: userMessage },
          ],
        },
      ],
    });
    return {
      text: extractText(response.content),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
      provider: 'anthropic',
      latencyMs: Date.now() - startMs,
    };
  },

  async compareImages(systemPrompt, img1Base64, img2Base64, userMessage, options): Promise<AiResponse> {
    const claude = getClient();
    const model = options?.model ?? config.claudeModel;
    const startMs = Date.now();
    const response = await claude.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: img1Base64 },
            },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: img2Base64 },
            },
            { type: 'text', text: userMessage },
          ],
        },
      ],
    });
    return {
      text: extractText(response.content),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
      provider: 'anthropic',
      latencyMs: Date.now() - startMs,
    };
  },
};

/** Raw Anthropic SDK client (for agentic tool_use loops) */
export function getAnthropicClient(): Anthropic {
  return getClient();
}
