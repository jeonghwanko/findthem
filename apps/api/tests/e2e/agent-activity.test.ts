import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Prisma mock (vi.mock factory 내에서 정의) ──
vi.mock('../../src/db/client.js', () => {
  const fn = vi.fn;
  return {
    prisma: {
      agentDecisionLog: {
        findMany: fn(),
        groupBy: fn(),
      },
      communityPost: {
        findMany: fn(),
        findUnique: fn(),
        create: fn(),
        update: fn(),
        delete: fn(),
        count: fn(),
        groupBy: fn(),
      },
      communityComment: {
        findUnique: fn(),
        count: fn(),
        create: fn(),
        delete: fn(),
      },
      user: { findUnique: fn() },
    },
  };
});

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/services/webhookDispatcher.js', () => ({
  dispatchWebhookToAll: vi.fn(),
  dispatchWebhookToAgent: vi.fn(),
}));

import { prisma } from '../../src/db/client.js';
import { registerCommunityRoutes } from '../../src/routes/community.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

// ── 미니 Express 앱 ──
function createApp() {
  const a = express();
  a.use(express.json());
  const router = express.Router();
  registerCommunityRoutes(router);
  a.use('/api', router);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a.use((err: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message ?? 'SERVER_ERROR' });
  });
  return request(a);
}

// ── 픽스처 ──
const NOW = new Date('2026-03-20T09:00:00.000Z');
const AGENT_IDS = ['image-matching', 'promotion', 'chatbot-alert'] as const;

function makeDecision(agentId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `decision-${agentId}`,
    agentId,
    eventType: 'match_detected',
    selectedAction: 'write_post_analytical',
    stayedSilent: false,
    createdAt: NOW,
    reportId: 'report-1',
    ...overrides,
  };
}

function makePost(agentId: string, overrides: Record<string, unknown> = {}) {
  return { id: `post-${agentId}`, agentId, title: `${agentId} 활동`, createdAt: NOW, ...overrides };
}

function makeGroupBy(agentId: string, count: number) {
  return { agentId, _count: count };
}

function setupDefaultMocks() {
  prismaMock.agentDecisionLog.findMany.mockResolvedValue(AGENT_IDS.map((id) => makeDecision(id)));
  prismaMock.agentDecisionLog.groupBy.mockResolvedValue(AGENT_IDS.map((id) => makeGroupBy(id, 3)));
  prismaMock.communityPost.findMany.mockResolvedValue(AGENT_IDS.map((id) => makePost(id)));
  prismaMock.communityPost.groupBy.mockResolvedValue(AGENT_IDS.map((id) => makeGroupBy(id, 2)));
}

describe('GET /api/community/agent-activity', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('200 → agents 배열과 serverTime 반환', async () => {
    const res = await app.get('/api/community/agent-activity');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(res.body).toHaveProperty('serverTime');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  it('agents에 3개 에이전트 ID가 포함된다', async () => {
    const res = await app.get('/api/community/agent-activity');
    const ids = res.body.agents.map((a: { agentId: string }) => a.agentId);
    expect(ids).toHaveLength(3);
    expect(ids).toContain('image-matching');
    expect(ids).toContain('promotion');
    expect(ids).toContain('chatbot-alert');
  });

  it('각 에이전트가 필수 필드를 갖는다', async () => {
    const res = await app.get('/api/community/agent-activity');
    for (const agent of res.body.agents) {
      expect(agent).toHaveProperty('agentId');
      expect(agent).toHaveProperty('todayPosts');
      expect(agent).toHaveProperty('todayDecisions');
      expect(agent).toHaveProperty('latestPost');
      expect(agent).toHaveProperty('recentEvents');
    }
  });

  it('serverTime이 유효한 ISO 문자열이다', async () => {
    const res = await app.get('/api/community/agent-activity');
    const parsed = new Date(res.body.serverTime);
    expect(parsed.toISOString()).toBe(res.body.serverTime);
  });

  it('Cache-Control 헤더 포함', async () => {
    const res = await app.get('/api/community/agent-activity');
    expect(res.headers['cache-control']).toBe('private, max-age=10');
  });

  it('todayPosts가 communityPost.groupBy 카운트와 일치', async () => {
    prismaMock.communityPost.groupBy.mockResolvedValue([
      makeGroupBy('image-matching', 5),
      makeGroupBy('promotion', 1),
    ]);
    const res = await app.get('/api/community/agent-activity');
    const byId = Object.fromEntries(
      res.body.agents.map((a: { agentId: string; todayPosts: number }) => [a.agentId, a.todayPosts]),
    );
    expect(byId['image-matching']).toBe(5);
    expect(byId['promotion']).toBe(1);
    expect(byId['chatbot-alert']).toBe(0);
  });

  it('게시글 없으면 latestPost는 null', async () => {
    prismaMock.communityPost.findMany.mockResolvedValue([]);
    const res = await app.get('/api/community/agent-activity');
    for (const agent of res.body.agents) {
      expect(agent.latestPost).toBeNull();
    }
  });

  it('recentEvents가 에이전트별로 분리된다', async () => {
    prismaMock.agentDecisionLog.findMany.mockResolvedValue([
      makeDecision('image-matching', { id: 'e1' }),
      makeDecision('image-matching', { id: 'e2' }),
      makeDecision('promotion', { id: 'e3' }),
    ]);
    const res = await app.get('/api/community/agent-activity');
    const byId = Object.fromEntries(
      res.body.agents.map((a: { agentId: string; recentEvents: unknown[] }) => [a.agentId, a.recentEvents.length]),
    );
    expect(byId['image-matching']).toBe(2);
    expect(byId['promotion']).toBe(1);
    expect(byId['chatbot-alert']).toBe(0);
  });

  it('recentEvents 항목이 필수 필드를 갖는다', async () => {
    prismaMock.agentDecisionLog.findMany.mockResolvedValue([
      makeDecision('image-matching', { id: 'ev1', reportId: 'r42' }),
    ]);
    const res = await app.get('/api/community/agent-activity');
    const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
    const ev = claude.recentEvents[0];
    expect(ev).toHaveProperty('id', 'ev1');
    expect(ev).toHaveProperty('eventType');
    expect(ev).toHaveProperty('selectedAction');
    expect(ev).toHaveProperty('stayedSilent', false);
    expect(ev).toHaveProperty('createdAt');
    expect(ev).toHaveProperty('reportId', 'r42');
  });

  it('since 없으면 UTC 오늘 자정부터 조회', async () => {
    await app.get('/api/community/agent-activity');
    const call = prismaMock.agentDecisionLog.findMany.mock.calls[0][0];
    const used: Date = call.where.createdAt.gte;
    expect(used.getUTCHours()).toBe(0);
    expect(used.getUTCMinutes()).toBe(0);
    expect(used.getUTCSeconds()).toBe(0);
  });

  it('?limit=5 → take: 5', async () => {
    await app.get('/api/community/agent-activity?limit=5');
    expect(prismaMock.agentDecisionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('limit 기본값 20', async () => {
    await app.get('/api/community/agent-activity');
    const call = prismaMock.agentDecisionLog.findMany.mock.calls[0][0];
    expect(call.take).toBe(20);
  });

  it('Authorization 없이 접근 가능 (optionalAuth)', async () => {
    const res = await app.get('/api/community/agent-activity');
    expect(res.status).toBe(200);
  });
});
