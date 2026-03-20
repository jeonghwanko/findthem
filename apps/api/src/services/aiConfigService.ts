import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { getAllSettings, invalidateSettingsCache, getApiKey } from '../ai/aiSettings.js';
import { ADMIN_AGENT_IDS, AI_PROVIDER_VALUES } from '@findthem/shared';

// ── 프로바이더별 모델 목록 ──

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
};

// ── AI 설정 조회 ──

interface AiSettingsResponse {
  defaultProvider: string;
  defaultModel: string;
  agents: Record<string, { provider: string | null; model: string | null }>;
  availableProviders: Array<{ name: string; configured: boolean; models: string[] }>;
}

export async function getAiSettings(): Promise<AiSettingsResponse> {
  const settings = await getAllSettings();

  const defaultProvider = settings.get('default_provider') ?? 'gemini';
  const defaultModel = settings.get('default_model') ?? 'gemini-2.5-flash';

  const agents: Record<string, { provider: string | null; model: string | null }> = {};
  for (const agentId of ADMIN_AGENT_IDS) {
    agents[agentId] = {
      provider: settings.get(`agent:${agentId}:provider`) ?? null,
      model: settings.get(`agent:${agentId}:model`) ?? null,
    };
  }

  const availableProviders = await Promise.all(
    Object.entries(PROVIDER_MODELS).map(async ([name, models]) => ({
      name,
      configured: !!(await getApiKey(name)),
      models,
    })),
  );

  return { defaultProvider, defaultModel, agents, availableProviders };
}

// ── AI 설정 변경 ──

export async function updateAiSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await prisma.aiSetting.deleteMany({ where: { key } });
  } else {
    await prisma.aiSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  invalidateSettingsCache();
}

// ── API 키 상태 조회 ──

const API_KEY_PROVIDERS = AI_PROVIDER_VALUES;

interface KeyStatus {
  configured: boolean;
  masked: string;
}

export async function getApiKeyStatuses(): Promise<Record<string, KeyStatus>> {
  const keys: Record<string, KeyStatus> = {};

  for (const provider of API_KEY_PROVIDERS) {
    const dbKey = await prisma.aiSetting.findUnique({ where: { key: `api_key_${provider}` } });
    const envKey = provider === 'anthropic' ? config.anthropicApiKey
      : provider === 'gemini' ? config.geminiApiKey
      : config.openaiApiKey;
    const rawKey = dbKey?.value || envKey;
    keys[provider] = {
      configured: !!rawKey,
      masked: rawKey
        ? (rawKey.length > 16 ? `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}` : '***configured***')
        : '',
    };
  }
  return keys;
}

// ── API 키 저장 ──

export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  await prisma.aiSetting.upsert({
    where: { key: `api_key_${provider}` },
    create: { key: `api_key_${provider}`, value: apiKey },
    update: { value: apiKey },
  });
}

// ── API 키 연결 테스트 ──

interface ApiKeyTestResult {
  success: boolean;
  model?: string;
  error?: string;
  latencyMs: number;
}

async function resolveTestKey(provider: string, inputKey?: string): Promise<string | null> {
  if (inputKey) return inputKey;
  const dbKey = await prisma.aiSetting.findUnique({ where: { key: `api_key_${provider}` } });
  const envKey = provider === 'anthropic' ? config.anthropicApiKey
    : provider === 'gemini' ? config.geminiApiKey
    : config.openaiApiKey;
  return dbKey?.value || envKey || null;
}

export async function testApiKey(provider: string, inputKey?: string): Promise<ApiKeyTestResult> {
  const testKey = await resolveTestKey(provider, inputKey);
  if (!testKey) {
    return { success: false, error: 'API_KEY_NOT_CONFIGURED', latencyMs: 0 };
  }

  const start = Date.now();
  try {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': testKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 16, messages: [{ role: 'user', content: 'Hi' }] }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await r.json() as Record<string, unknown>;
      if (!r.ok) throw new Error((body.error as Record<string, string>)?.message ?? `HTTP ${r.status}`);
      return { success: true, model: (body.model as string) ?? 'claude', latencyMs: Date.now() - start };
    } else if (provider === 'gemini') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': testKey, 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 16 } }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await r.json() as Record<string, unknown>;
      if (!r.ok) throw new Error((body.error as Record<string, string>)?.message ?? `HTTP ${r.status}`);
      return { success: true, model: 'gemini-2.5-flash', latencyMs: Date.now() - start };
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${testKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 16 }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await r.json() as Record<string, unknown>;
      if (!r.ok) throw new Error((body.error as Record<string, string>)?.message ?? `HTTP ${r.status}`);
      return { success: true, model: (body.model as string) ?? 'gpt-4o-mini', latencyMs: Date.now() - start };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error', latencyMs: Date.now() - start };
  }
}
