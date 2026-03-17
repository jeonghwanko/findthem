import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestApp, authHeader, testReport } from '../helpers.js';
import { prisma } from '../../src/db/client.js';
import { promotionQueue } from '../../src/jobs/queues.js';
import { MAX_BOOSTS_PER_DAY } from '@findthem/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const promotionQueueMock = promotionQueue as any;

const REPORT_ID = 'test-report-id';
const USER_ID = 'test-user-id';
const OTHER_USER_ID = 'other-user-id';

const ownedReport = {
  id: REPORT_ID,
  userId: USER_ID,
  status: 'ACTIVE' as const,
};

describe('Promotions E2E — boost-status / boost', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    // requireAuth 미들웨어용 user mock
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    // $transaction: callback(prismaMock) 실행
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ────────────────────────────────────────────────────────────
  // GET /api/reports/:id/boost-status
  // ────────────────────────────────────────────────────────────
  describe('GET /api/reports/:id/boost-status', () => {
    it('비인증 → 401', async () => {
      const res = await app.get(`/api/reports/${REPORT_ID}/boost-status`);
      expect(res.status).toBe(401);
    });

    it('존재하지 않는 reportId → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app
        .get(`/api/reports/nonexistent-id/boost-status`)
        .set('Authorization', authHeader());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('REPORT_NOT_FOUND');
    });

    it('타인 신고 → 403', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: REPORT_ID,
        userId: OTHER_USER_ID,
      });

      const res = await app
        .get(`/api/reports/${REPORT_ID}/boost-status`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('REPORT_OWNER_ONLY');
    });

    it('오늘 부스트 0회 → boostsUsedToday: 0, maxBoosts: MAX_BOOSTS_PER_DAY', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-01T09:00:00Z'));

      prismaMock.report.findUnique.mockResolvedValue({
        id: REPORT_ID,
        userId: USER_ID,
      });
      prismaMock.promotionLog.count.mockResolvedValue(0);

      const res = await app
        .get(`/api/reports/${REPORT_ID}/boost-status`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(200);
      expect(res.body.boostsUsedToday).toBe(0);
      expect(res.body.maxBoosts).toBe(MAX_BOOSTS_PER_DAY);
    });

    it('오늘 부스트 2회 사용 → boostsUsedToday: 2', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-01T15:00:00Z'));

      prismaMock.report.findUnique.mockResolvedValue({
        id: REPORT_ID,
        userId: USER_ID,
      });
      prismaMock.promotionLog.count.mockResolvedValue(2);

      const res = await app
        .get(`/api/reports/${REPORT_ID}/boost-status`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(200);
      expect(res.body.boostsUsedToday).toBe(2);
      expect(res.body.maxBoosts).toBe(MAX_BOOSTS_PER_DAY);
    });

    it('promotionLog.count가 UTC 자정 기준 gte 조건으로 호출되는지 확인', async () => {
      vi.useFakeTimers();
      // UTC 2025-06-01 09:00:00 → todayStart = 2025-06-01T00:00:00.000Z
      vi.setSystemTime(new Date('2025-06-01T09:00:00Z'));

      prismaMock.report.findUnique.mockResolvedValue({
        id: REPORT_ID,
        userId: USER_ID,
      });
      prismaMock.promotionLog.count.mockResolvedValue(1);

      await app
        .get(`/api/reports/${REPORT_ID}/boost-status`)
        .set('Authorization', authHeader(USER_ID));

      expect(prismaMock.promotionLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reportId: REPORT_ID,
            action: 'ad_boost',
            createdAt: { gte: new Date('2025-06-01T00:00:00.000Z') },
          }),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // POST /api/reports/:id/boost
  // ────────────────────────────────────────────────────────────
  describe('POST /api/reports/:id/boost', () => {
    it('비인증 → 401', async () => {
      const res = await app.post(`/api/reports/${REPORT_ID}/boost`);
      expect(res.status).toBe(401);
    });

    it('존재하지 않는 reportId → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app
        .post(`/api/reports/nonexistent-id/boost`)
        .set('Authorization', authHeader());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('REPORT_NOT_FOUND');
    });

    it('타인 신고 → 403', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: REPORT_ID,
        userId: OTHER_USER_ID,
        status: 'ACTIVE',
      });

      const res = await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('REPORT_OWNER_ONLY');
    });

    it('ACTIVE 아닌 신고(FOUND) → 400 REPORT_STATUS_INVALID', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: REPORT_ID,
        userId: USER_ID,
        status: 'FOUND',
      });

      const res = await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('REPORT_STATUS_INVALID');
    });

    it('한도 초과(3회 이미 사용) → 429 BOOST_LIMIT_REACHED', async () => {
      prismaMock.report.findUnique.mockResolvedValue(ownedReport);
      // $transaction 내부에서 count가 MAX_BOOSTS_PER_DAY(3) 반환 → 429
      prismaMock.promotionLog.count.mockResolvedValue(MAX_BOOSTS_PER_DAY);

      const res = await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('BOOST_LIMIT_REACHED');
    });

    it('성공 시: 200, ok: true, boostsRemaining 반환', async () => {
      prismaMock.report.findUnique.mockResolvedValue(ownedReport);
      // 오늘 1회 사용 → count=1, 성공 후 remaining = 3 - 1 - 1 = 1
      prismaMock.promotionLog.count.mockResolvedValue(1);
      prismaMock.promotion.findFirst.mockResolvedValue({ version: 2 });
      prismaMock.promotionStrategy.findUnique.mockResolvedValue({
        targetPlatforms: ['TWITTER', 'KAKAO_CHANNEL'],
      });
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });

      const res = await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('boostsRemaining');
      expect(res.body.boostsRemaining).toBe(1);
    });

    it('성공 시: promotionQueue.add 호출 확인', async () => {
      prismaMock.report.findUnique.mockResolvedValue(ownedReport);
      prismaMock.promotionLog.count.mockResolvedValue(0);
      prismaMock.promotion.findFirst.mockResolvedValue({ version: 1 });
      prismaMock.promotionStrategy.findUnique.mockResolvedValue({
        targetPlatforms: ['TWITTER'],
      });
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });

      await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(promotionQueueMock.add).toHaveBeenCalledWith(
        'ad-boost',
        expect.objectContaining({
          reportId: REPORT_ID,
          isRepost: true,
          regenerateContent: true,
        }),
        expect.objectContaining({
          attempts: 3,
          jobId: expect.stringContaining(`boost-${REPORT_ID}`),
        }),
      );
    });

    it('성공 시: PromotionLog action="ad_boost" create 호출 확인', async () => {
      prismaMock.report.findUnique.mockResolvedValue(ownedReport);
      prismaMock.promotionLog.count.mockResolvedValue(0);
      prismaMock.promotion.findFirst.mockResolvedValue(null);
      prismaMock.promotionStrategy.findUnique.mockResolvedValue(null);
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-2' });
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });

      await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(prismaMock.promotionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportId: REPORT_ID,
            action: 'ad_boost',
          }),
        }),
      );
    });

    it('성공 시 boostsRemaining 계산: count=0 → remaining=2', async () => {
      prismaMock.report.findUnique.mockResolvedValue(ownedReport);
      prismaMock.promotionLog.count.mockResolvedValue(0);
      prismaMock.promotion.findFirst.mockResolvedValue(null);
      prismaMock.promotionStrategy.findUnique.mockResolvedValue(null);
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-3' });
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });

      const res = await app
        .post(`/api/reports/${REPORT_ID}/boost`)
        .set('Authorization', authHeader(USER_ID));

      expect(res.status).toBe(200);
      // MAX_BOOSTS_PER_DAY(3) - count(0) - 1 = 2
      expect(res.body.boostsRemaining).toBe(2);
    });
  });
});
