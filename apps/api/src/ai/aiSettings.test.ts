import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    aiSetting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../config.js', () => ({
  config: {
    claudeModel: 'claude-sonnet-4-20250514',
    anthropicApiKey: 'test-key',
    geminiApiKey: '',
    openaiApiKey: '',
  },
}));

vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { prisma } from '../db/client.js';
import {
  getProviderName,
  getModelName,
  getAnthropicModelName,
  isPersonCrawlEnabled,
  invalidateSettingsCache,
} from './aiSettings.js';

const prismaMock = prisma as unknown as {
  aiSetting: { findMany: ReturnType<typeof vi.fn> };
};

describe('aiSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSettingsCache();
    prismaMock.aiSetting.findMany.mockResolvedValue([]);
  });

  describe('getProviderName', () => {
    it('DB 설정 없으면 gemini 반환 (기본값)', async () => {
      expect(await getProviderName()).toBe('gemini');
    });

    it('DB에 default_provider 설정 시 해당 값 반환', async () => {
      prismaMock.aiSetting.findMany.mockResolvedValue([
        { key: 'default_provider', value: 'openai' },
      ]);

      expect(await getProviderName()).toBe('openai');
    });

    it('에이전트별 오버라이드 우선', async () => {
      prismaMock.aiSetting.findMany.mockResolvedValue([
        { key: 'default_provider', value: 'gemini' },
        { key: 'agent:image-matching:provider', value: 'anthropic' },
      ]);

      expect(await getProviderName('image-matching')).toBe('anthropic');
    });
  });

  describe('getModelName', () => {
    it('DB 설정 없으면 gemini-2.5-flash 반환 (기본값)', async () => {
      expect(await getModelName()).toBe('gemini-2.5-flash');
    });
  });

  describe('getAnthropicModelName', () => {
    it('DB 설정 없으면 config.claudeModel 반환', async () => {
      expect(await getAnthropicModelName()).toBe('claude-sonnet-4-20250514');
    });

    it('에이전트별 오버라이드 적용', async () => {
      prismaMock.aiSetting.findMany.mockResolvedValue([
        { key: 'agent:sighting:model', value: 'claude-haiku-4-20250514' },
      ]);

      expect(await getAnthropicModelName('sighting')).toBe('claude-haiku-4-20250514');
    });

    it('anthropic_model 글로벌 fallback', async () => {
      prismaMock.aiSetting.findMany.mockResolvedValue([
        { key: 'anthropic_model', value: 'claude-opus-4-20250514' },
      ]);

      expect(await getAnthropicModelName()).toBe('claude-opus-4-20250514');
    });
  });

  describe('isPersonCrawlEnabled', () => {
    it('기본값 false', async () => {
      expect(await isPersonCrawlEnabled()).toBe(false);
    });

    it('설정 true → true 반환', async () => {
      prismaMock.aiSetting.findMany.mockResolvedValue([
        { key: 'crawl:enable-person', value: 'true' },
      ]);

      expect(await isPersonCrawlEnabled()).toBe(true);
    });

    it('설정 false → false 반환', async () => {
      prismaMock.aiSetting.findMany.mockResolvedValue([
        { key: 'crawl:enable-person', value: 'false' },
      ]);

      expect(await isPersonCrawlEnabled()).toBe(false);
    });
  });
});
