/**
 * aiClient.ts — 멀티 프로바이더 AI 클라이언트
 *
 * claudeClient.ts와 동일한 함수 시그니처를 유지하여 drop-in 교체 가능.
 * DB의 AiSetting 테이블에서 provider/model을 동적으로 읽고,
 * 모든 호출 결과를 AiUsageLog 테이블에 기록한다.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getProviderName, getModelName } from './aiSettings.js';
import { trackUsage, trackFailure } from './aiUsageTracker.js';
import { anthropicProvider, getAnthropicClient } from './providers/anthropic.js';
import { geminiProvider } from './providers/gemini.js';
import { openaiProvider } from './providers/openai.js';
import { createLogger } from '../logger.js';
import type { AiProvider, AiResponse } from './providers/types.js';

const log = createLogger('aiClient');

const PROVIDERS: Record<string, AiProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  openai: openaiProvider,
};

async function resolveProvider(agentId?: string): Promise<AiProvider> {
  const name = await getProviderName(agentId);
  const provider = PROVIDERS[name];
  if (!provider) {
    log.warn({ name, agentId }, '알 수 없는 provider, anthropic으로 fallback');
    return anthropicProvider;
  }
  return provider;
}

// ── Backward-compatible wrapper exports ──

/** 텍스트 메시지 전송 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; agentId?: string },
): Promise<string> {
  const agentId = options?.agentId ?? 'unknown';
  const provider = await resolveProvider(agentId);
  const model = options?.model ?? (await getModelName(agentId));

  let response: AiResponse | null = null;
  const startMs = Date.now();
  try {
    response = await provider.ask(systemPrompt, userMessage, {
      maxTokens: options?.maxTokens,
      model,
    });
    await trackUsage(agentId, response, true);
    return response.text;
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const errMsg = err instanceof Error ? err.message : String(err);
    await trackFailure(agentId, provider.name, model ?? 'unknown', latencyMs, errMsg);
    log.error({ err, agentId, provider: provider.name }, 'AI 호출 실패');
    throw err;
  }
}

/** Vision 메시지 전송 (이미지 + 텍스트) */
export async function askClaudeWithImage(
  systemPrompt: string,
  imageBase64: string,
  userMessage: string,
  options?: { maxTokens?: number; model?: string; mediaType?: string; agentId?: string },
): Promise<string> {
  const agentId = options?.agentId ?? 'unknown';
  const provider = await resolveProvider(agentId);
  const model = options?.model ?? (await getModelName(agentId));

  let response: AiResponse | null = null;
  const startMs = Date.now();
  try {
    response = await provider.askWithImage(systemPrompt, imageBase64, userMessage, {
      maxTokens: options?.maxTokens,
      model,
      mediaType: options?.mediaType,
    });
    await trackUsage(agentId, response, true);
    return response.text;
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const errMsg = err instanceof Error ? err.message : String(err);
    await trackFailure(agentId, provider.name, model ?? 'unknown', latencyMs, errMsg);
    log.error({ err, agentId, provider: provider.name }, 'AI 이미지 호출 실패');
    throw err;
  }
}

/** 두 이미지 비교 (매칭용) */
export async function compareImages(
  systemPrompt: string,
  image1Base64: string,
  image2Base64: string,
  userMessage: string,
  options?: { maxTokens?: number; agentId?: string },
): Promise<string> {
  const agentId = options?.agentId ?? 'unknown';
  const provider = await resolveProvider(agentId);
  const model = await getModelName(agentId);

  let response: AiResponse | null = null;
  const startMs = Date.now();
  try {
    response = await provider.compareImages(systemPrompt, image1Base64, image2Base64, userMessage, {
      maxTokens: options?.maxTokens,
      model,
    });
    await trackUsage(agentId, response, true);
    return response.text;
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const errMsg = err instanceof Error ? err.message : String(err);
    await trackFailure(agentId, provider.name, model ?? 'unknown', latencyMs, errMsg);
    log.error({ err, agentId, provider: provider.name }, 'AI 이미지 비교 호출 실패');
    throw err;
  }
}

/**
 * Raw Anthropic SDK 클라이언트 반환.
 * Anthropic tool_use 형식을 직접 사용하는 agentic 루프 전용
 * (sightingAgent, crawlAgent, adminAgent).
 */
export async function getClaudeClient(): Promise<Anthropic> {
  return getAnthropicClient();
}
