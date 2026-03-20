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

async function getCachedSettings(): Promise<Map<string, string>> {
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

/** agentId에 대한 provider 이름 반환. 없으면 default_provider → 'gemini' */
export async function getProviderName(agentId?: string): Promise<string> {
  const settings = await getCachedSettings();

  if (agentId) {
    const agentProvider = settings.get(`agent:${agentId}:provider`);
    if (agentProvider) return agentProvider;
  }

  return settings.get('default_provider') ?? 'gemini';
}

/** agentId에 대한 model 이름 반환. 없으면 default_model → 'gemini-2.5-flash' */
export async function getModelName(agentId?: string): Promise<string | undefined> {
  const settings = await getCachedSettings();

  if (agentId) {
    const agentModel = settings.get(`agent:${agentId}:model`);
    if (agentModel) return agentModel;
  }

  return settings.get('default_model') ?? 'gemini-2.5-flash';
}

/** Anthropic SDK 직접 호출용 모델명 (tool_use 에이전트 전용). Gemini/OpenAI 모델명이 섞이지 않도록 분리 */
export async function getAnthropicModelName(agentId?: string): Promise<string> {
  const settings = await getCachedSettings();
  if (agentId) {
    const agentModel = settings.get(`agent:${agentId}:model`);
    if (agentModel) return agentModel;
  }
  return settings.get('anthropic_model') ?? config.claudeModel;
}

/** 전체 설정 Map 반환 */
export async function getAllSettings(): Promise<Map<string, string>> {
  return getCachedSettings();
}

/** 사람 실종 정보 크롤 활성화 여부 (기본 false) */
export async function isPersonCrawlEnabled(): Promise<boolean> {
  const settings = await getCachedSettings();
  return settings.get('crawl:enable-person') === 'true';
}

// ── 크론 설정 ──

export type CronJobKey = 'crawl-scheduler' | 'qa-crawl' | 'promotion-repost';

const CRON_DEFAULT_INTERVAL: Record<CronJobKey, number> = {
  'crawl-scheduler': 24,
  'qa-crawl': 24,
  'promotion-repost': 24,
};

/** 크론 잡 활성화 여부 (기본 false) */
export async function isCronEnabled(jobKey: CronJobKey): Promise<boolean> {
  const settings = await getCachedSettings();
  return settings.get(`cron:${jobKey}:enabled`) === 'true';
}

/** 크론 잡 실행 간격(시간 단위, 기본 24) */
export async function getCronIntervalHours(jobKey: CronJobKey): Promise<number> {
  const settings = await getCachedSettings();
  const raw = settings.get(`cron:${jobKey}:interval`);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CRON_DEFAULT_INTERVAL[jobKey];
}

/** provider에 대한 API 키 반환. DB에 저장된 키가 있으면 우선, 없으면 환경 변수 fallback */
export async function getApiKey(provider: string): Promise<string> {
  const settings = await getCachedSettings();
  const dbKey = settings.get(`api_key_${provider}`);
  if (dbKey) return dbKey;
  if (provider === 'anthropic') return config.anthropicApiKey;
  if (provider === 'gemini') return config.geminiApiKey;
  if (provider === 'openai') return config.openaiApiKey;
  return '';
}
