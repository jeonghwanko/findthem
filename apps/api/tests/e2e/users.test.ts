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
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
  });

  // ── GET /api/users/me/xp-stats ──
  describe('GET /api/users/me/xp-stats', () => {
    it('로그인 시 XP 통계 반환 → 200', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false }) // requireAuth
        .mockResolvedValueOnce({ sponsorXp: 1200, userLevel: 2 }); // xp-stats 핸들러

      const res = await app
        .get('/api/users/me/xp-stats')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sponsorXp', 1200);
      expect(res.body).toHaveProperty('userLevel');
      expect(res.body).toHaveProperty('currentXP');
      expect(res.body).toHaveProperty('xpToNextLevel');
      expect(res.body).toHaveProperty('xpRequiredForLevel');
    });

    it('XP 0인 신규 유저 → level 1, currentXP 0', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ sponsorXp: 0, userLevel: 1 });

      const res = await app
        .get('/api/users/me/xp-stats')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.sponsorXp).toBe(0);
      expect(res.body.userLevel).toBe(1);
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
      prismaMock.$executeRaw.mockResolvedValue(1); // 쿨다운 체크 통과
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false }) // requireAuth
        .mockResolvedValueOnce({ sponsorXp: 100 }); // 현재 XP 조회
      prismaMock.user.update.mockResolvedValue({});

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('newXp', 100 + XP_PER_AD);
      expect(res.body).toHaveProperty('xpGained', XP_PER_AD);
      expect(res.body).toHaveProperty('leveledUp');
      expect(res.body).toHaveProperty('newLevel');
    });

    it('쿨다운 중 → 429 AD_REWARD_COOLDOWN', async () => {
      prismaMock.$executeRaw.mockResolvedValue(0); // 쿨다운 위반

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

    it('유저 없음 → 404', async () => {
      prismaMock.$executeRaw.mockResolvedValue(1);
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce(null);

      const res = await app
        .post('/api/users/me/ad-reward')
        .set('Authorization', authHeader());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('USER_NOT_FOUND');
    });

    it('레벨업 시 leveledUp: true + reward 포함', async () => {
      // Level 1 → Level 2로 레벨업 되도록 XP 설정 (requirementForLevel(1) = 1000)
      const prevXp = 1000 - XP_PER_AD; // 50 XP 부족 → 광고 보상으로 레벨 2 달성
      prismaMock.$executeRaw.mockResolvedValue(1);
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ sponsorXp: prevXp });
      prismaMock.user.update.mockResolvedValue({});
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
      // upsert가 호출되었는지 확인
      expect(prismaMock.userReward.upsert).toHaveBeenCalledOnce();
    });

    it('레벨업 없을 때 leveledUp: false + reward 없음', async () => {
      prismaMock.$executeRaw.mockResolvedValue(1);
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ sponsorXp: 0 }); // 0 + 50 = 50 XP (레벨 1 유지)
      prismaMock.user.update.mockResolvedValue({});

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
      // Level 3 → Level 4 (LEVEL_REWARDS에 4가 없음)
      // requirementForLevel(1)=1000 + (2)=1150 + (3)=1300 = 3450
      // 레벨4 진입에 필요한 누적 XP: 3450
      const prevXp = 3450 - XP_PER_AD;
      prismaMock.$executeRaw.mockResolvedValue(1);
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ sponsorXp: prevXp });
      prismaMock.user.update.mockResolvedValue({});

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
});
