import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import type { AiResponse } from './providers/types.js';

const log = createLogger('aiUsageTracker');

export async function trackUsage(
  agentId: string,
  response: AiResponse,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        agentId,
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.inputTokens + response.outputTokens,
        latencyMs: response.latencyMs,
        success,
        errorMessage: errorMessage ?? null,
      },
    });
  } catch (err) {
    // 사용량 추적 실패는 주요 흐름을 방해하지 않음
    log.warn({ err, agentId }, 'AI 사용량 로그 저장 실패');
  }
}

/** 실패한 호출 기록 (provider/model 정보가 없을 수 있으므로 별도 처리) */
export async function trackFailure(
  agentId: string,
  provider: string,
  model: string,
  latencyMs: number,
  errorMessage: string,
): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        agentId,
        provider,
        model,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs,
        success: false,
        errorMessage,
      },
    });
  } catch (err) {
    log.warn({ err, agentId }, 'AI 실패 로그 저장 실패');
  }
}
