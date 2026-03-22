import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader, testUser } from '../helpers.js';
import { prisma } from '../../src/db/client.js';
import { XP_PER_AD } from '@findthem/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Users E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.xpLog = {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    };
    // grantXp 내부: SELECT FOR UPDATE
    prismaMock.$queryRaw = vi.fn().mockResolvedValue([{ xp: 0 }]);
    // grantXp 내부: 조건부 INSERT (dailyLimit 있는 액션) 또는 쿨다운 선점 (ad-reward)
    prismaMock.$executeRaw = vi.fn().mockResolvedValue(1);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
  });

  // ── GET /api/users/me/xp-stats ──
  describe('GET /api/users/me/xp-stats', () => {
    it('로그인 시 XP 통계 반환 → 200', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ xp: 1200, level: 2 });

      const res = await app
        .get('/api/users/me/xp-stats')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xp', 1200);
      expect(res.body).toHaveProperty('level');
      expect(res.body).toHaveProperty('currentXP');
      expect(res.body).toHaveProperty('xpToNextLevel');
      expect(res.body).toHaveProperty('xpRequiredForLevel');
    });

    it('XP 0인 신규 유저 → level 1, currentXP 0', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ xp: 0, level: 1 });

      const res = await app
        .get('/api/users/me/xp-stats')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.xp).toBe(0);
      expect(res.body.level).toBe(1);
      expect(res.body.currentXP).toBe(0);
      expect(res.body.xpToNextLevel).toBeGreaterThan(0);
    });

    it('토큰 없음 → 401', async () => {
      const res = await app.get('/api/users/me/xp-stats');
      expect(res.status).toBe(401);
    });

    it('유저 없음 → 404', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce(null);

      const res = await app
        .get('/api/users/me/xp-stats')
        .set('Authorization', authHeader());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('USER_NOT_FOUND');
    });
  });

  // ── POST /api/users/me/ad-reward ──
  describe('POST /api/users/me/ad-reward', () => {
    it('광고 보상 성공 → 200 + XP 증가', async () => {
      const prevXp = 100;
      // 쿨다운 선점 성공
      prismaMock.$executeRaw.mockResolvedValueOnce(1);
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      // AD_WATCH dailyLimit=null → xpLog.create 사용
      // SELECT FOR UPDATE
      prismaMock.$queryRaw.mockResolvedValueOnce([{ xp: prevXp }]);
      prismaMock.user.update.mockResolvedValueOnce({});

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('newXp', prevXp + XP_PER_AD);
      expect(res.body).toHaveProperty('xpGained', XP_PER_AD);
      expect(res.body).toHaveProperty('leveledUp', false);
      expect(res.body).toHaveProperty('newLevel', 1);
    });

    it('쿨다운 중 → 429 AD_REWARD_COOLDOWN', async () => {
      prismaMock.$executeRaw.mockResolvedValue(0);

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('AD_REWARD_COOLDOWN');
    });

    it('토큰 없음 → 401', async () => {
      const res = await app.post('/api/users/me/ad-reward');
      expect(res.status).toBe(401);
    });

    it('레벨업 시 leveledUp: true + reward 포함', async () => {
      const prevXp = 1000 - XP_PER_AD;
      prismaMock.$executeRaw.mockResolvedValueOnce(1); // 쿨다운 선점
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      prismaMock.$queryRaw.mockResolvedValueOnce([{ xp: prevXp }]);
      prismaMock.user.update.mockResolvedValueOnce({});
      prismaMock.userReward.upsert.mockResolvedValue({});

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.leveledUp).toBe(true);
      expect(res.body.newLevel).toBe(2);
      expect(res.body.reward).toBeDefined();
      expect(res.body.reward.type).toBe('BADGE');
      expect(res.body.reward.value).toBe('supporter');
      expect(prismaMock.userReward.upsert).toHaveBeenCalledOnce();
    });

    it('레벨업 없을 때 leveledUp: false + reward 없음', async () => {
      prismaMock.$executeRaw.mockResolvedValueOnce(1); // 쿨다운 선점
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      prismaMock.$queryRaw.mockResolvedValueOnce([{ xp: 0 }]);
      prismaMock.user.update.mockResolvedValueOnce({});

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.leveledUp).toBe(false);
      expect(res.body.newLevel).toBe(1);
      expect(res.body.reward).toBeUndefined();
      expect(prismaMock.userReward.upsert).not.toHaveBeenCalled();
    });

    it('보상 없는 레벨(4)로 레벨업 시 reward 없음', async () => {
      const prevXp = 3450 - XP_PER_AD;
      prismaMock.$executeRaw.mockResolvedValueOnce(1); // 쿨다운 선점
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      prismaMock.$queryRaw.mockResolvedValueOnce([{ xp: prevXp }]);
      prismaMock.user.update.mockResolvedValueOnce({});

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.leveledUp).toBe(true);
      expect(res.body.newLevel).toBe(4);
      expect(res.body.reward).toBeUndefined();
      expect(prismaMock.userReward.upsert).not.toHaveBeenCalled();
    });
  });

  // ── POST /api/users/me/share-reward ──
  describe('POST /api/users/me/share-reward', () => {
    it('공유 보상 성공 → 200 + XP 증가', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      // SHARE dailyLimit=5 → 조건부 INSERT ($executeRaw) 성공
      prismaMock.$executeRaw.mockResolvedValueOnce(1);
      // SELECT FOR UPDATE
      prismaMock.$queryRaw.mockResolvedValueOnce([{ xp: 0 }]);
      prismaMock.user.update.mockResolvedValueOnce({});

      const res = await app
        .post('/api/users/me/share-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xpGained', 20);
      expect(res.body).toHaveProperty('newXp', 20);
    });

    it('일일 한도 초과 → 429', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      // 조건부 INSERT 실패 (한도 초과)
      prismaMock.$executeRaw.mockResolvedValueOnce(0);

      const res = await app
        .post('/api/users/me/share-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('XP_DAILY_LIMIT_REACHED');
    });

    it('토큰 없음 → 401', async () => {
      const res = await app.post('/api/users/me/share-reward');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/users/me/xp-history ──
  describe('GET /api/users/me/xp-history', () => {
    it('XP 이력 조회 → 200', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      const mockItems = [
        { id: 'xp1', userId: testUser.userId, action: 'AD_WATCH', xpAmount: 50, sourceId: null, createdAt: new Date() },
        { id: 'xp2', userId: testUser.userId, action: 'SHARE', xpAmount: 20, sourceId: null, createdAt: new Date() },
      ];
      prismaMock.xpLog.findMany.mockResolvedValueOnce(mockItems);
      prismaMock.xpLog.count.mockResolvedValueOnce(2);

      const res = await app
        .get('/api/users/me/xp-history?page=1&limit=10')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(2);
      expect(res.body).toHaveProperty('total', 2);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('totalPages', 1);
    });

    it('페이지네이션 → page, totalPages 계산', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ isBlocked: false });
      prismaMock.xpLog.findMany.mockResolvedValueOnce([]);
      prismaMock.xpLog.count.mockResolvedValueOnce(25);

      const res = await app
        .get('/api/users/me/xp-history?page=2&limit=10')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.total).toBe(25);
    });

    it('토큰 없음 → 401', async () => {
      const res = await app.get('/api/users/me/xp-history');
      expect(res.status).toBe(401);
    });
  });
});
