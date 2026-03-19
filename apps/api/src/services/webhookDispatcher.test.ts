import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// prisma mock
vi.mock('../db/client.js', () => ({
  prisma: {
    externalAgent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// logger mock
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// dns mock
vi.mock('node:dns/promises', () => ({
  resolve: vi.fn(),
}));

import { prisma } from '../db/client.js';
import { resolve as dnsResolve } from 'node:dns/promises';
import { dispatchWebhookToAll, dispatchWebhookToAgent } from './webhookDispatcher.js';
import type { WebhookPayload } from './webhookDispatcher.js';

const prismaMock = prisma as unknown as {
  externalAgent: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};
const dnsResolveMock = dnsResolve as ReturnType<typeof vi.fn>;

// 테스트용 payload 헬퍼
function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    event: 'new_question',
    postId: 'post-1',
    postTitle: '테스트 질문 제목',
    postContent: '테스트 질문 내용입니다.',
    sourceUrl: 'https://example.com/q/1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// 테스트용 에이전트 헬퍼
function makeAgent(overrides: Partial<{
  id: string;
  name: string;
  webhookUrl: string | null;
  apiKey: string;
  isActive: boolean;
}> = {}) {
  return {
    id: 'agent-1',
    name: '테스트 에이전트',
    webhookUrl: 'https://external-agent.example.com/webhook',
    apiKey: 'test-api-key-sha256hash',
    isActive: true,
    ...overrides,
  };
}

describe('webhookDispatcher', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 공개 IP로 resolve
    dnsResolveMock.mockResolvedValue(['1.2.3.4']);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── dispatchWebhookToAll ───────────────────────────────────────────────────

  describe('dispatchWebhookToAll', () => {
    describe('SSRF 방어 — HTTP URL 차단', () => {
      it('http:// URL → HTTPS 에러로 fetch 미호출', async () => {
        const agent = makeAgent({ webhookUrl: 'http://external-agent.example.com/webhook' });
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);

        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload());

        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe('SSRF 방어 — 사설 IP 차단', () => {
      it.each([
        ['루프백 127.0.0.1', ['127.0.0.1']],
        ['사설 10.x', ['10.0.0.1']],
        ['사설 192.168.x', ['192.168.1.1']],
        ['링크로컬 169.254.x', ['169.254.0.1']],
        ['사설 172.16.x', ['172.16.0.1']],
      ])('%s → fetch 미호출', async (_label, ips) => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(ips);

        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload());

        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe('정상 발송', () => {
      it('HTTPS URL + 공개 IP → fetch 호출됨', async () => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload());

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(fetchSpy).toHaveBeenCalledWith(
          agent.webhookUrl,
          expect.objectContaining({ method: 'POST' }),
        );
      });

      it('활성 에이전트가 없으면 fetch 미호출', async () => {
        prismaMock.externalAgent.findMany.mockResolvedValue([]);

        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload());

        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it('findMany에 isActive=true, webhookUrl not null 조건 전달', async () => {
        prismaMock.externalAgent.findMany.mockResolvedValue([]);

        await dispatchWebhookToAll(makePayload());

        expect(prismaMock.externalAgent.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              isActive: true,
              webhookUrl: { not: null },
            }),
          }),
        );
      });
    });

    describe('HMAC 서명 검증', () => {
      it('X-Webhook-Signature 헤더에 HMAC-SHA256 서명 포함', async () => {
        const agent = makeAgent({ apiKey: 'my-secret-key' });
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchSpy;

        const payload = makePayload();
        await dispatchWebhookToAll(payload);

        const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = options.headers as Record<string, string>;
        const body = options.body as string;

        const expectedSig = createHmac('sha256', agent.apiKey)
          .update(body)
          .digest('hex');

        expect(headers['X-Webhook-Signature']).toBe(expectedSig);
      });

      it('X-Webhook-Event 헤더에 이벤트 타입 포함', async () => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload({ event: 'new_comment' }));

        const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = options.headers as Record<string, string>;
        expect(headers['X-Webhook-Event']).toBe('new_comment');
      });
    });

    describe('payload truncation', () => {
      it('postContent가 500자로 잘림', async () => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchSpy;

        const longContent = 'A'.repeat(1000);
        await dispatchWebhookToAll(makePayload({ postContent: longContent }));

        const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as WebhookPayload;

        expect(body.postContent).toHaveLength(500);
        expect(body.postContent).toBe('A'.repeat(500));
      });

      it('postContent가 500자 이하면 그대로 전달', async () => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchSpy;

        const shortContent = '짧은 내용';
        await dispatchWebhookToAll(makePayload({ postContent: shortContent }));

        const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as WebhookPayload;
        expect(body.postContent).toBe(shortContent);
      });
    });

    describe('webhookUrl 없는 에이전트 스킵', () => {
      it('webhookUrl=null 에이전트는 fetch 미호출', async () => {
        // findMany where 조건에서 이미 걸러지지만, 혹시 null이 넘어왔을 때도 안전하게 처리되어야 함
        const agent = makeAgent({ webhookUrl: null });
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);

        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload());

        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe('fetch 실패 처리', () => {
      it('fetch throw 시 에러 없이 로그만 남김 (throw 안 함)', async () => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

        await expect(dispatchWebhookToAll(makePayload())).resolves.toBeUndefined();
      });

      it('non-2xx 응답 시 에러 throw 없이 완료', async () => {
        const agent = makeAgent();
        prismaMock.externalAgent.findMany.mockResolvedValue([agent]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(dispatchWebhookToAll(makePayload())).resolves.toBeUndefined();
      });

      it('한 에이전트 실패해도 다른 에이전트에 발송 시도', async () => {
        const agent1 = makeAgent({ id: 'agent-1', name: '에이전트1' });
        const agent2 = makeAgent({ id: 'agent-2', name: '에이전트2', webhookUrl: 'https://second-agent.example.com/webhook' });
        prismaMock.externalAgent.findMany.mockResolvedValue([agent1, agent2]);
        dnsResolveMock.mockResolvedValue(['203.0.113.1']);

        // 첫 번째 에이전트는 DNS가 사설 IP로 resolve (SSRF 차단)
        dnsResolveMock
          .mockResolvedValueOnce(['127.0.0.1'])   // agent1 → SSRF 차단
          .mockResolvedValueOnce(['203.0.113.1']); // agent2 → 통과

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchSpy;

        await dispatchWebhookToAll(makePayload());

        // agent2만 fetch 호출됨
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(agent2.webhookUrl, expect.anything());
      });
    });
  });

  // ── dispatchWebhookToAgent ─────────────────────────────────────────────────

  describe('dispatchWebhookToAgent', () => {
    it('특정 에이전트에만 발송 — findUnique로 조회', async () => {
      const agent = makeAgent();
      prismaMock.externalAgent.findUnique.mockResolvedValue(agent);
      dnsResolveMock.mockResolvedValue(['203.0.113.1']);

      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = fetchSpy;

      await dispatchWebhookToAgent('agent-1', makePayload());

      expect(prismaMock.externalAgent.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'agent-1' } }),
      );
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledWith(agent.webhookUrl, expect.anything());
    });

    it('에이전트를 찾지 못하면 fetch 미호출', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValue(null);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await dispatchWebhookToAgent('non-existent-id', makePayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('isActive=false 에이전트 → fetch 미호출', async () => {
      const agent = makeAgent({ isActive: false });
      prismaMock.externalAgent.findUnique.mockResolvedValue(agent);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await dispatchWebhookToAgent('agent-1', makePayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('webhookUrl=null 에이전트 → fetch 미호출', async () => {
      const agent = makeAgent({ webhookUrl: null });
      prismaMock.externalAgent.findUnique.mockResolvedValue(agent);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await dispatchWebhookToAgent('agent-1', makePayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetch throw 시 에러 없이 완료 (throw 안 함)', async () => {
      const agent = makeAgent();
      prismaMock.externalAgent.findUnique.mockResolvedValue(agent);
      dnsResolveMock.mockResolvedValue(['203.0.113.1']);

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(dispatchWebhookToAgent('agent-1', makePayload())).resolves.toBeUndefined();
    });

    it('사설 IP → fetch 미호출 (SSRF 방어)', async () => {
      const agent = makeAgent();
      prismaMock.externalAgent.findUnique.mockResolvedValue(agent);
      dnsResolveMock.mockResolvedValue(['10.0.0.1']);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await dispatchWebhookToAgent('agent-1', makePayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
