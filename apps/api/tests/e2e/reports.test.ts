import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { createTestApp, authHeader, testUser, testReport } from '../helpers.js';
import { prismaMock } from '../setup.js';
import { cleanupQueue } from '../../src/jobs/queues.js';

describe('Reports E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/reports ──
  describe('POST /api/reports', () => {
    it('비인증 → 401', async () => {
      const res = await app
        .post('/api/reports')
        .field('data', JSON.stringify({
          subjectType: 'DOG',
          name: '초코',
          features: '갈색 푸들',
          lastSeenAt: '2025-01-15T14:00:00Z',
          lastSeenAddress: '서울시 강남구',
          contactPhone: '01012345678',
          contactName: '테스트',
        }));

      expect(res.status).toBe(401);
    });

    it('사진 없이 제출 → 400', async () => {
      prismaMock.report.create.mockResolvedValue(testReport);

      const res = await app
        .post('/api/reports')
        .set('Authorization', authHeader())
        .field('data', JSON.stringify({
          subjectType: 'DOG',
          name: '초코',
          features: '갈색 푸들',
          lastSeenAt: '2025-01-15T14:00:00Z',
          lastSeenAddress: '서울시 강남구',
          contactPhone: '01012345678',
          contactName: '테스트',
        }));

      expect(res.status).toBe(400);
    });

    it('인증 + 사진 → 201 + 리포트 생성', async () => {
      prismaMock.report.create.mockResolvedValue(testReport);
      prismaMock.reportPhoto.create.mockResolvedValue({
        id: 'photo-1',
        reportId: testReport.id,
        photoUrl: '/uploads/reports/photo.jpg',
        thumbnailUrl: '/uploads/thumbs/photo.jpg',
        isPrimary: true,
        aiAnalysis: null,
        createdAt: new Date(),
      });

      // 1px 투명 PNG
      const tinyPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await app
        .post('/api/reports')
        .set('Authorization', authHeader())
        .field('data', JSON.stringify({
          subjectType: 'DOG',
          name: '초코',
          features: '갈색 푸들',
          lastSeenAt: '2025-01-15T14:00:00Z',
          lastSeenAddress: '서울시 강남구',
          contactPhone: '01012345678',
          contactName: '테스트',
        }))
        .attach('photos', tinyPng, 'test-photo.png');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prismaMock.report.create).toHaveBeenCalledOnce();
    });
  });

  // ── GET /api/reports ──
  describe('GET /api/reports', () => {
    it('페이지네이션 기본값 → 200 + 목록', async () => {
      prismaMock.report.findMany.mockResolvedValue([testReport]);
      prismaMock.report.count.mockResolvedValue(1);

      const res = await app.get('/api/reports');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('reports');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('totalPages');
    });

    it('subjectType 필터 적용', async () => {
      prismaMock.report.findMany.mockResolvedValue([]);
      prismaMock.report.count.mockResolvedValue(0);

      const res = await app.get('/api/reports?type=CAT');

      expect(res.status).toBe(200);
      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subjectType: 'CAT' }),
        }),
      );
    });

    it('페이지 + limit 파라미터', async () => {
      prismaMock.report.findMany.mockResolvedValue([]);
      prismaMock.report.count.mockResolvedValue(0);

      const res = await app.get('/api/reports?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (2-1) * 5
          take: 5,
        }),
      );
    });
  });

  // ── GET /api/reports/mine ──
  describe('GET /api/reports/mine', () => {
    it('인증 → 본인 신고 목록', async () => {
      prismaMock.report.findMany.mockResolvedValue([testReport]);

      const res = await app
        .get('/api/reports/mine')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
        }),
      );
    });

    it('비인증 → 401', async () => {
      const res = await app.get('/api/reports/mine');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/reports/:id ──
  describe('GET /api/reports/:id', () => {
    it('존재하는 ID → 200', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        ...testReport,
        photos: [],
        user: { id: testUser.id, name: testUser.name },
        _count: { sightings: 0, matches: 0 },
      });

      const res = await app.get(`/api/reports/${testReport.id}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('초코');
    });

    it('없는 ID → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app.get('/api/reports/nonexistent-id');

      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/reports/:id/status ──
  describe('PATCH /api/reports/:id/status', () => {
    it('본인 신고 상태 변경 → 200', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      prismaMock.report.update.mockResolvedValue({ ...testReport, status: 'FOUND' });

      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'FOUND' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('FOUND');
      expect(cleanupQueue.add).toHaveBeenCalledWith(
        'cleanup-sns-posts',
        { reportId: testReport.id },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('타인의 신고 → 403', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        ...testReport,
        userId: 'other-user-id',
      });

      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'FOUND' });

      expect(res.status).toBe(403);
    });
  });
});
