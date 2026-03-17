import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('aiSettings');

const CACHE_TTL_MS = 60_000;

interface SettingsCache {
  data: Map<string, string>;
  expiresAt: number;
}

let cache: SettingsCache | null = null;

async function getSettings(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }

  try {
    const rows = await prisma.aiSetting.findMany();
    const map = new Map<string, string>(rows.map((r) => [r.key, r.value]));
    cache = { data: map, expiresAt: now + CACHE_TTL_MS };
    return map;
  } catch (err) {
    log.warn({ err }, 'AiSetting 조회 실패, 기본값 사용');
    return cache?.data ?? new Map();
  }
}

/** 캐시 무효화 (설정 변경 후 호출) */
export function invalidateSettingsCache(): void {
  cache = null;
}

/** agentId에 대한 provider 이름 반환. 없으면 default_provider → 'anthropic' */
export async function getProviderName(agentId?: string): Promise<string> {
  const settings = await getSettings();

  if (agentId) {
    const agentProvider = settings.get(`agent:${agentId}:provider`);
    if (agentProvider) return agentProvider;
  }

  return settings.get('default_provider') ?? 'anthropic';
}

/** agentId에 대한 model 이름 반환. 없으면 default_model → config.claudeModel */
export async function getModelName(agentId?: string): Promise<string | undefined> {
  const settings = await getSettings();

  if (agentId) {
    const agentModel = settings.get(`agent:${agentId}:model`);
    if (agentModel) return agentModel;
  }

  return settings.get('default_model') ?? config.claudeModel;
}

/** 전체 설정 Map 반환 */
export async function getAllSettings(): Promise<Map<string, string>> {
  return getSettings();
}
