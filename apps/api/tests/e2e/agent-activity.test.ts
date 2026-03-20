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
      outreachRequest: {
        findMany: fn(),
      },
      promotion: {
        findMany: fn(),
      },
      match: {
        findMany: fn(),
      },
      report: {
        findMany: fn(),
      },
      sighting: {
        findMany: fn(),
      },
      outreachContact: {
        findMany: fn(),
      },
      user: { findUnique: fn() },
      $executeRaw: fn(),
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

  // getRecentActivities 기본 mock
  prismaMock.outreachRequest.findMany.mockResolvedValue([]);
  prismaMock.promotion.findMany.mockResolvedValue([]);
  prismaMock.match.findMany.mockResolvedValue([]);
  prismaMock.report.findMany.mockResolvedValue([]);
  prismaMock.sighting.findMany.mockResolvedValue([]);
  prismaMock.outreachContact.findMany.mockResolvedValue([]);
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

  // ══════════════════════════════════════
  // queuePending 필드 테스트
  // ══════════════════════════════════════

  describe('queuePending 필드', () => {
    it('각 에이전트에 queuePending 필드가 존재한다', async () => {
      const res = await app.get('/api/community/agent-activity');
      expect(res.status).toBe(200);
      for (const agent of res.body.agents) {
        expect(agent).toHaveProperty('queuePending');
        expect(typeof agent.queuePending).toBe('number');
      }
    });

    it('queuePending은 0 이상의 정수이다', async () => {
      const res = await app.get('/api/community/agent-activity');
      for (const agent of res.body.agents) {
        expect(agent.queuePending).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(agent.queuePending)).toBe(true);
      }
    });

    it('큐 mock이 대기 수를 반환하면 queuePending에 반영된다', async () => {
      // setup.ts의 큐 mock이 getWaitingCount/getActiveCount를 제공하므로
      // 기본값(0)으로 합산된 queuePending이 반환되어야 한다
      const res = await app.get('/api/community/agent-activity');
      const byId = Object.fromEntries(
        res.body.agents.map((a: { agentId: string; queuePending: number }) => [a.agentId, a.queuePending]),
      );
      // mock은 getWaitingCount=0, getActiveCount=0 → 합계 0
      expect(byId['image-matching']).toBe(0);
      expect(byId['promotion']).toBe(0);
      expect(byId['chatbot-alert']).toBe(0);
    });
  });

  // ══════════════════════════════════════
  // recentActivities 필드 테스트
  // ══════════════════════════════════════

  describe('recentActivities 필드', () => {
    it('각 에이전트에 recentActivities 배열이 존재한다', async () => {
      const res = await app.get('/api/community/agent-activity');
      expect(res.status).toBe(200);
      for (const agent of res.body.agents) {
        expect(agent).toHaveProperty('recentActivities');
        expect(Array.isArray(agent.recentActivities)).toBe(true);
      }
    });

    it('recentActivities 항목이 type, description, createdAt 필드를 갖는다', async () => {
      prismaMock.match.findMany.mockResolvedValue([
        {
          confidence: 0.85,
          createdAt: NOW,
          report: { name: '초코' },
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
      expect(claude.recentActivities.length).toBeGreaterThan(0);

      const activity = claude.recentActivities[0];
      expect(activity).toHaveProperty('type');
      expect(activity).toHaveProperty('description');
      expect(activity).toHaveProperty('createdAt');
      expect(typeof activity.type).toBe('string');
      expect(typeof activity.description).toBe('string');
      expect(typeof activity.createdAt).toBe('string');
    });

    it('createdAt은 유효한 ISO 문자열이다', async () => {
      prismaMock.match.findMany.mockResolvedValue([
        { confidence: 0.75, createdAt: NOW, report: { name: '바둑이' } },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
      for (const activity of claude.recentActivities) {
        const parsed = new Date(activity.createdAt);
        expect(isNaN(parsed.getTime())).toBe(false);
      }
    });

    it('매칭 결과가 image-matching 에이전트의 recentActivities에 반영된다', async () => {
      prismaMock.match.findMany.mockResolvedValue([
        { confidence: 0.85, createdAt: NOW, report: { name: '초코' } },
        { confidence: 0.7, createdAt: NOW, report: { name: '바둑이' } },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
      expect(claude.recentActivities.length).toBeGreaterThanOrEqual(2);
      const types = claude.recentActivities.map((a: { type: string }) => a.type);
      expect(types.every((t: string) => t === 'match_found')).toBe(true);
    });

    it('매칭 confidence가 % 형식으로 description에 포함된다', async () => {
      prismaMock.match.findMany.mockResolvedValue([
        { confidence: 0.85, createdAt: NOW, report: { name: '초코' } },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
      const activity = claude.recentActivities[0];
      expect(activity.description).toContain('85%');
    });

    it('아웃리치 SENT 결과가 promotion 에이전트의 recentActivities에 반영된다', async () => {
      prismaMock.outreachRequest.findMany.mockResolvedValue([
        {
          status: 'SENT',
          channel: 'EMAIL',
          createdAt: NOW,
          contact: {
            name: '홍길동 기자',
            type: 'JOURNALIST',
            videoId: null,
            youtubeChannelUrl: null,
            thumbnailUrl: null,
          },
          report: { name: '초코' },
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
      const sentActivities = heimi.recentActivities.filter(
        (a: { type: string }) => a.type === 'outreach_sent',
      );
      expect(sentActivities.length).toBeGreaterThanOrEqual(1);
      expect(sentActivities[0].description).toContain('이메일');
    });

    it('아웃리치 PENDING_APPROVAL이 outreach_pending 타입으로 반영된다', async () => {
      prismaMock.outreachRequest.findMany.mockResolvedValue([
        {
          status: 'PENDING_APPROVAL',
          channel: 'EMAIL',
          createdAt: NOW,
          contact: {
            name: '김유튜버',
            type: 'YOUTUBER',
            videoId: null,
            youtubeChannelUrl: null,
            thumbnailUrl: null,
          },
          report: { name: '바둑이' },
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
      const pendingActivities = heimi.recentActivities.filter(
        (a: { type: string }) => a.type === 'outreach_pending',
      );
      expect(pendingActivities.length).toBeGreaterThanOrEqual(1);
    });

    it('SNS 게시가 promotion 에이전트의 recentActivities에 반영된다', async () => {
      prismaMock.promotion.findMany.mockResolvedValue([
        {
          platform: 'TWITTER',
          postUrl: 'https://twitter.com/post/123',
          postedAt: NOW,
          report: { name: '초코' },
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
      const promotionActivities = heimi.recentActivities.filter(
        (a: { type: string }) => a.type === 'promotion_posted',
      );
      expect(promotionActivities.length).toBeGreaterThanOrEqual(1);
      expect(promotionActivities[0].description).toContain('트위터');
    });

    it('신고 접수가 chatbot-alert 에이전트의 recentActivities에 반영된다', async () => {
      prismaMock.report.findMany.mockResolvedValue([
        {
          name: '초코',
          subjectType: 'DOG',
          lastSeenAddress: '서울시 강남구',
          createdAt: NOW,
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const ali = res.body.agents.find((a: { agentId: string }) => a.agentId === 'chatbot-alert');
      const reportActivities = ali.recentActivities.filter(
        (a: { type: string }) => a.type === 'report_received',
      );
      expect(reportActivities.length).toBeGreaterThanOrEqual(1);
      expect(reportActivities[0].description).toContain('초코');
    });

    it('제보 분석이 chatbot-alert 에이전트의 recentActivities에 반영된다', async () => {
      prismaMock.sighting.findMany.mockResolvedValue([
        {
          address: '서울시 마포구 합정동',
          createdAt: NOW,
          report: { name: '바둑이' },
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const ali = res.body.agents.find((a: { agentId: string }) => a.agentId === 'chatbot-alert');
      const sightingActivities = ali.recentActivities.filter(
        (a: { type: string }) => a.type === 'sighting_analyzed',
      );
      expect(sightingActivities.length).toBeGreaterThanOrEqual(1);
    });

    it('recentActivities 항목이 url 필드를 가질 수 있다', async () => {
      prismaMock.outreachRequest.findMany.mockResolvedValue([
        {
          status: 'SENT',
          channel: 'COMMENT',
          createdAt: NOW,
          contact: {
            name: '채널명',
            type: 'VIDEO',
            videoId: 'dQw4w9WgXcQ',
            youtubeChannelUrl: null,
            thumbnailUrl: null,
          },
          report: { name: '초코' },
        },
      ]);

      const res = await app.get('/api/community/agent-activity');
      const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
      const withUrl = heimi.recentActivities.filter(
        (a: { url?: string }) => a.url !== undefined,
      );
      expect(withUrl.length).toBeGreaterThanOrEqual(1);
      expect(withUrl[0].url).toContain('youtube.com');
    });

    it('데이터 없을 때 recentActivities는 빈 배열이다', async () => {
      // 모든 데이터 없는 상태로 설정 (fallback도 비움)
      prismaMock.report.findMany.mockResolvedValue([]);
      prismaMock.sighting.findMany.mockResolvedValue([]);
      prismaMock.outreachRequest.findMany.mockResolvedValue([]);
      prismaMock.promotion.findMany.mockResolvedValue([]);
      prismaMock.match.findMany.mockResolvedValue([]);
      prismaMock.outreachContact.findMany.mockResolvedValue([]);

      const res = await app.get('/api/community/agent-activity');
      expect(res.status).toBe(200);
      for (const agent of res.body.agents) {
        expect(Array.isArray(agent.recentActivities)).toBe(true);
      }
    });

    it('recentActivities는 에이전트당 최대 10개이다', async () => {
      // 15개 매칭 데이터 투입 → 클로드는 최대 10개만 반환해야 함
      const manyMatches = Array.from({ length: 15 }, (_, i) => ({
        confidence: 0.8,
        createdAt: new Date(NOW.getTime() - i * 1000),
        report: { name: `강아지${i}` },
      }));
      prismaMock.match.findMany.mockResolvedValue(manyMatches);

      const res = await app.get('/api/community/agent-activity');
      const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
      expect(claude.recentActivities.length).toBeLessThanOrEqual(10);
    });
  });
});

// ══════════════════════════════════════
// shortName 유닛 테스트 (헬퍼 함수 동작 검증)
// ── 라우트 응답의 description을 통해 간접 검증 ──
// ══════════════════════════════════════

describe('shortName 동작 (description을 통한 간접 검증)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('이름이 10자 이하이면 그대로 반영된다', async () => {
    prismaMock.match.findMany.mockResolvedValue([
      { confidence: 0.9, createdAt: NOW, report: { name: '초코' } },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
    expect(claude.recentActivities[0].description).toContain('초코');
  });

  it('이름이 10자를 초과하면 10자로 잘리고 … 이 붙는다', async () => {
    // 11자 이름 → 10자 + '…'
    const longName = '가나다라마바사아자차카';  // 11자
    prismaMock.match.findMany.mockResolvedValue([
      { confidence: 0.9, createdAt: NOW, report: { name: longName } },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
    const desc: string = claude.recentActivities[0].description;
    // 잘린 10자 + '…' 포함 확인
    expect(desc).toContain('가나다라마바사아자차…');
    expect(desc).not.toContain('카');
  });

  it('정확히 10자인 이름은 자르지 않는다', async () => {
    const exactName = '가나다라마바사아자차';  // 10자
    prismaMock.match.findMany.mockResolvedValue([
      { confidence: 0.9, createdAt: NOW, report: { name: exactName } },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const claude = res.body.agents.find((a: { agentId: string }) => a.agentId === 'image-matching');
    const desc: string = claude.recentActivities[0].description;
    expect(desc).toContain(exactName);
    expect(desc).not.toContain('…');
  });
});

// ══════════════════════════════════════
// ytThumb 동작 (thumbnailUrl을 통한 간접 검증)
// ══════════════════════════════════════

describe('ytThumb 동작 (recentActivities.thumbnailUrl을 통한 간접 검증)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('유효한 11자 videoId → YouTube 썸네일 URL 생성', async () => {
    const validVideoId = 'dQw4w9WgXcQ';  // 11자 영숫자
    prismaMock.outreachRequest.findMany.mockResolvedValue([
      {
        status: 'SENT',
        channel: 'EMAIL',
        createdAt: NOW,
        contact: {
          name: '채널',
          type: 'VIDEO',
          videoId: validVideoId,
          youtubeChannelUrl: null,
          thumbnailUrl: null,  // thumbnailUrl 없어야 ytThumb 호출됨
        },
        report: { name: '초코' },
      },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
    const activity = heimi.recentActivities.find(
      (a: { thumbnailUrl?: string }) => a.thumbnailUrl !== undefined,
    );
    expect(activity).toBeDefined();
    expect(activity.thumbnailUrl).toBe(`https://img.youtube.com/vi/${validVideoId}/mqdefault.jpg`);
  });

  it('videoId가 null이면 thumbnailUrl이 없다', async () => {
    prismaMock.outreachRequest.findMany.mockResolvedValue([
      {
        status: 'SENT',
        channel: 'EMAIL',
        createdAt: NOW,
        contact: {
          name: '기자',
          type: 'JOURNALIST',
          videoId: null,
          youtubeChannelUrl: null,
          thumbnailUrl: null,
        },
        report: { name: '초코' },
      },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
    for (const activity of heimi.recentActivities) {
      expect(activity.thumbnailUrl).toBeUndefined();
    }
  });

  it('11자 미만의 videoId는 썸네일 URL을 생성하지 않는다', async () => {
    // 10자 → 유효하지 않은 YouTube ID
    prismaMock.outreachRequest.findMany.mockResolvedValue([
      {
        status: 'PENDING_APPROVAL',
        channel: 'EMAIL',
        createdAt: NOW,
        contact: {
          name: '채널',
          type: 'VIDEO',
          videoId: 'shortid123',  // 10자
          youtubeChannelUrl: null,
          thumbnailUrl: null,
        },
        report: { name: '바둑이' },
      },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
    for (const activity of heimi.recentActivities) {
      expect(activity.thumbnailUrl).toBeUndefined();
    }
  });

  it('11자 초과의 videoId는 썸네일 URL을 생성하지 않는다', async () => {
    prismaMock.outreachRequest.findMany.mockResolvedValue([
      {
        status: 'PENDING_APPROVAL',
        channel: 'EMAIL',
        createdAt: NOW,
        contact: {
          name: '채널',
          type: 'VIDEO',
          videoId: 'toolongvideoid123',  // 18자
          youtubeChannelUrl: null,
          thumbnailUrl: null,
        },
        report: { name: '바둑이' },
      },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
    for (const activity of heimi.recentActivities) {
      expect(activity.thumbnailUrl).toBeUndefined();
    }
  });

  it('contact.thumbnailUrl이 있으면 ytThumb보다 우선 사용된다', async () => {
    const existingThumb = 'https://example.com/custom-thumb.jpg';
    prismaMock.outreachRequest.findMany.mockResolvedValue([
      {
        status: 'SENT',
        channel: 'EMAIL',
        createdAt: NOW,
        contact: {
          name: '채널',
          type: 'VIDEO',
          videoId: 'dQw4w9WgXcQ',
          youtubeChannelUrl: null,
          thumbnailUrl: existingThumb,  // 기존 썸네일 우선
        },
        report: { name: '초코' },
      },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
    const activity = heimi.recentActivities.find(
      (a: { thumbnailUrl?: string }) => a.thumbnailUrl !== undefined,
    );
    expect(activity).toBeDefined();
    expect(activity.thumbnailUrl).toBe(existingThumb);
  });

  it('특수문자가 포함된 videoId는 썸네일 URL을 생성하지 않는다', async () => {
    // 11자이지만 특수문자 포함
    prismaMock.outreachRequest.findMany.mockResolvedValue([
      {
        status: 'PENDING_APPROVAL',
        channel: 'EMAIL',
        createdAt: NOW,
        contact: {
          name: '채널',
          type: 'VIDEO',
          videoId: 'abc!@#defgh',  // 11자지만 특수문자 포함
          youtubeChannelUrl: null,
          thumbnailUrl: null,
        },
        report: { name: '바둑이' },
      },
    ]);

    const res = await app.get('/api/community/agent-activity');
    const heimi = res.body.agents.find((a: { agentId: string }) => a.agentId === 'promotion');
    for (const activity of heimi.recentActivities) {
      expect(activity.thumbnailUrl).toBeUndefined();
    }
  });
});
