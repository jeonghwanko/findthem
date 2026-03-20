import { getApiKey } from '../aiSettings.js';
import type { AiProvider, AiResponse } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const BASE_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAiContentPart[];
}

interface OpenAiContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message: string;
    type: string;
  };
}

async function callOpenAi(
  model: string,
  messages: OpenAiMessage[],
  maxTokens: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_NOT_CONFIGURED');
  }

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  const data = (await res.json()) as OpenAiResponse;

  if (!res.ok || data.error) {
    throw new Error(`OPENAI_API_ERROR: ${data.error?.message ?? res.statusText}`);
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

export const openaiProvider: AiProvider = {
  name: 'openai',

  async ask(systemPrompt, userMessage, options): Promise<AiResponse> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxTokens = options?.maxTokens ?? 1024;
    const startMs = Date.now();

    const messages: OpenAiMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const { text, inputTokens, outputTokens } = await callOpenAi(model, messages, maxTokens);
    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'openai',
      latencyMs: Date.now() - startMs,
    };
  },

  async askWithImage(systemPrompt, imageBase64, userMessage, options): Promise<AiResponse> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxTokens = options?.maxTokens ?? 1024;
    const mediaType = options?.mediaType ?? 'image/jpeg';
    const startMs = Date.now();

    const messages: OpenAiMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${imageBase64}` },
          },
          { type: 'text', text: userMessage },
        ],
      },
    ];

    const { text, inputTokens, outputTokens } = await callOpenAi(model, messages, maxTokens);
    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'openai',
      latencyMs: Date.now() - startMs,
    };
  },

  async compareImages(systemPrompt, img1Base64, img2Base64, userMessage, options): Promise<AiResponse> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxTokens = options?.maxTokens ?? 1024;
    const startMs = Date.now();

    const messages: OpenAiMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${img1Base64}` },
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${img2Base64}` },
          },
          { type: 'text', text: userMessage },
        ],
      },
    ];

    const { text, inputTokens, outputTokens } = await callOpenAi(model, messages, maxTokens);
    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'openai',
      latencyMs: Date.now() - startMs,
    };
  },
};
