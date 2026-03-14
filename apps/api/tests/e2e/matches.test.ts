import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader, testReport, testMatch, testSighting } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// setup.ts의 vi.mock 팩토리가 생성한 실제 mock 객체를 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Matches E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
  });

  // ── GET /api/reports/:id/matches ──
  describe('GET /api/reports/:id/matches', () => {
    it('본인 신고 매칭 조회 → 200 + 매칭 목록', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      prismaMock.match.findMany.mockResolvedValue([
        {
          ...testMatch,
          sighting: { ...testSighting, photos: [] },
        },
      ]);

      const res = await app
        .get(`/api/reports/${testReport.id}/matches`)
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.matches)).toBe(true);
      expect(res.body.matches[0].confidence).toBe(0.85);
    });

    it('비인증 → 401', async () => {
      const res = await app.get(`/api/reports/${testReport.id}/matches`);
      expect(res.status).toBe(401);
    });

    it('타인의 신고 → 403', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        ...testReport,
        userId: 'other-user-id',
      });

      const res = await app
        .get(`/api/reports/${testReport.id}/matches`)
        .set('Authorization', authHeader());

      expect(res.status).toBe(403);
    });

    it('존재하지 않는 신고 → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app
        .get('/api/reports/nonexistent-id/matches')
        .set('Authorization', authHeader());

      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/matches/:id ──
  describe('PATCH /api/matches/:id', () => {
    it('매칭 확인 (CONFIRMED) → 200', async () => {
      prismaMock.match.findUnique.mockResolvedValue({
        ...testMatch,
        report: testReport,
      });
      prismaMock.match.update.mockResolvedValue({
        ...testMatch,
        status: 'CONFIRMED',
        reviewedAt: new Date(),
      });

      const res = await app
        .patch(`/api/matches/${testMatch.id}`)
        .set('Authorization', authHeader())
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CONFIRMED');
    });

    it('매칭 거부 (REJECTED) → 200', async () => {
      prismaMock.match.findUnique.mockResolvedValue({
        ...testMatch,
        report: testReport,
      });
      prismaMock.match.update.mockResolvedValue({
        ...testMatch,
        status: 'REJECTED',
        reviewedAt: new Date(),
      });

      const res = await app
        .patch(`/api/matches/${testMatch.id}`)
        .set('Authorization', authHeader())
        .send({ status: 'REJECTED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
    });

    it('타인의 매칭 → 403', async () => {
      prismaMock.match.findUnique.mockResolvedValue({
        ...testMatch,
        report: { ...testReport, userId: 'other-user-id' },
      });

      const res = await app
        .patch(`/api/matches/${testMatch.id}`)
        .set('Authorization', authHeader())
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBe(403);
    });

    it('없는 매칭 → 404', async () => {
      prismaMock.match.findUnique.mockResolvedValue(null);

      const res = await app
        .patch('/api/matches/nonexistent-id')
        .set('Authorization', authHeader())
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBe(404);
    });

    it('잘못된 status → 400', async () => {
      const res = await app
        .patch(`/api/matches/${testMatch.id}`)
        .set('Authorization', authHeader())
        .send({ status: 'INVALID' });

      expect(res.status).toBe(400);
    });
  });
});
