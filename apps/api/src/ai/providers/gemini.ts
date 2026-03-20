import { getApiKey } from '../aiSettings.js';
import type { AiProvider, AiResponse } from './types.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: {
    message: string;
    code: number;
  };
}

async function callGemini(
  model: string,
  systemPrompt: string,
  contents: GeminiContent[],
  maxTokens: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = await getApiKey('gemini');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const url = `${BASE_URL}/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as GeminiResponse;

  if (!res.ok || data.error) {
    throw new Error(`GEMINI_API_ERROR: ${data.error?.message ?? res.statusText}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  return { text, inputTokens, outputTokens };
}

export const geminiProvider: AiProvider = {
  name: 'gemini',

  async ask(systemPrompt, userMessage, options): Promise<AiResponse> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxTokens = options?.maxTokens ?? 1024;
    const startMs = Date.now();

    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const { text, inputTokens, outputTokens } = await callGemini(model, systemPrompt, contents, maxTokens);
    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'gemini',
      latencyMs: Date.now() - startMs,
    };
  },

  async askWithImage(systemPrompt, imageBase64, userMessage, options): Promise<AiResponse> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxTokens = options?.maxTokens ?? 1024;
    const mimeType = options?.mediaType ?? 'image/jpeg';
    const startMs = Date.now();

    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: userMessage },
        ],
      },
    ];

    const { text, inputTokens, outputTokens } = await callGemini(model, systemPrompt, contents, maxTokens);
    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'gemini',
      latencyMs: Date.now() - startMs,
    };
  },

  async compareImages(systemPrompt, img1Base64, img2Base64, userMessage, options): Promise<AiResponse> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxTokens = options?.maxTokens ?? 1024;
    const startMs = Date.now();

    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: img1Base64 } },
          { inlineData: { mimeType: 'image/jpeg', data: img2Base64 } },
          { text: userMessage },
        ],
      },
    ];

    const { text, inputTokens, outputTokens } = await callGemini(model, systemPrompt, contents, maxTokens);
    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'gemini',
      latencyMs: Date.now() - startMs,
    };
  },
};
