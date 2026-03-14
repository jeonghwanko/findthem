import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { createTestApp, authHeader, testUser, testReport } from '../helpers.js';
import { prismaMock } from '../setup.js';
import { cleanupQueue } from '../../src/jobs/queues.js';

describe('Reports E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    // setup.ts의 beforeEach가 먼저 실행된 후 clearAllMocks()가 호출되므로
    // user.findUnique mock을 다시 설정하여 requireAuth가 정상 동작하도록 함
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
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
      const foundReport = { ...testReport, status: 'FOUND' as const };
      prismaMock.report.findUnique
        .mockResolvedValueOnce(testReport)          // 소유권 확인
        .mockResolvedValueOnce(foundReport);        // 변경 후 조회
      prismaMock.report.updateMany.mockResolvedValue({ count: 1 });

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

    // RACE-02: EXPIRED/SUSPENDED 상태 신고는 사용자가 변경 불가
    it('EXPIRED 상태 신고 → updateMany count=0, 현재 상태 그대로 반환', async () => {
      const expiredReport = { ...testReport, status: 'EXPIRED' as const };
      prismaMock.report.findUnique
        .mockResolvedValueOnce(expiredReport)       // 소유권 확인 (userId 일치)
        .mockResolvedValueOnce(expiredReport);      // count=0 후 현재 상태 조회
      // updateMany where: { status: { notIn: ['EXPIRED', 'SUSPENDED'] } } → count 0
      prismaMock.report.updateMany.mockResolvedValue({ count: 0 });

      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      // 상태 변경이 이루어지지 않아 EXPIRED 그대로 반환
      expect(res.body.status).toBe('EXPIRED');
      // cleanupQueue는 호출되지 않아야 함
      expect(cleanupQueue.add).not.toHaveBeenCalled();
    });

    it('SUSPENDED 상태 신고 → 상태 변경 없이 현재 상태 반환', async () => {
      const suspendedReport = { ...testReport, status: 'SUSPENDED' as const };
      prismaMock.report.findUnique
        .mockResolvedValueOnce(suspendedReport)
        .mockResolvedValueOnce(suspendedReport);
      prismaMock.report.updateMany.mockResolvedValue({ count: 0 });

      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SUSPENDED');
      expect(cleanupQueue.add).not.toHaveBeenCalled();
    });

    it('updateMany에 EXPIRED/SUSPENDED notIn 조건 포함', async () => {
      const foundReport = { ...testReport, status: 'FOUND' as const };
      prismaMock.report.findUnique
        .mockResolvedValueOnce(testReport)
        .mockResolvedValueOnce(foundReport);
      prismaMock.report.updateMany.mockResolvedValue({ count: 1 });

      await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'FOUND' });

      expect(prismaMock.report.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['EXPIRED', 'SUSPENDED'] },
          }),
        }),
      );
    });

    it('비인증 → 401', async () => {
      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .send({ status: 'FOUND' });

      expect(res.status).toBe(401);
    });

    it('존재하지 않는 신고 → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'FOUND' });

      expect(res.status).toBe(404);
    });

    it('유효하지 않은 status 값 → 400', async () => {
      const res = await app
        .patch(`/api/reports/${testReport.id}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/reports/:id/photos ──
  describe('POST /api/reports/:id/photos', () => {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    it('비인증 → 401', async () => {
      const res = await app
        .post(`/api/reports/${testReport.id}/photos`)
        .attach('photos', tinyPng, 'photo.png');

      expect(res.status).toBe(401);
    });

    it('존재하지 않는 신고 → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app
        .post(`/api/reports/${testReport.id}/photos`)
        .set('Authorization', authHeader())
        .attach('photos', tinyPng, 'photo.png');

      expect(res.status).toBe(404);
    });

    it('타인의 신고에 사진 추가 → 403', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        ...testReport,
        userId: 'other-user-id',
      });

      const res = await app
        .post(`/api/reports/${testReport.id}/photos`)
        .set('Authorization', authHeader())
        .attach('photos', tinyPng, 'photo.png');

      expect(res.status).toBe(403);
    });

    it('사진 추가 성공 → 201', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      // 트랜잭션 안에서 reportPhoto.count → 현재 3장
      prismaMock.reportPhoto.count.mockResolvedValue(3);
      prismaMock.reportPhoto.create.mockResolvedValue({
        id: 'new-photo-id',
        reportId: testReport.id,
        photoUrl: '/uploads/reports/new-photo.jpg',
        thumbnailUrl: '/uploads/thumbs/new-photo.jpg',
        isPrimary: false,
        aiAnalysis: null,
        createdAt: new Date(),
      });

      const res = await app
        .post(`/api/reports/${testReport.id}/photos`)
        .set('Authorization', authHeader())
        .attach('photos', tinyPng, 'photo.png');

      expect(res.status).toBe(201);
      expect(Array.isArray(res.body)).toBe(true);
    });

    // RACE-01: 동시에 사진이 MAX_REPORT_PHOTOS(5)를 초과하면 400
    it('현재 사진 수 + 업로드 수가 MAX_REPORT_PHOTOS 초과 → 400', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      // 현재 사진 5장 (MAX_REPORT_PHOTOS = 5)
      prismaMock.reportPhoto.count.mockResolvedValue(5);

      const res = await app
        .post(`/api/reports/${testReport.id}/photos`)
        .set('Authorization', authHeader())
        .attach('photos', tinyPng, 'photo.png');

      expect(res.status).toBe(400);
    });

    it('현재 4장 + 1장 업로드 = 5장(정확히 MAX) → 201 허용', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      // 현재 4장, 1장 추가 → 총 5장으로 MAX와 같음 (초과 아님)
      prismaMock.reportPhoto.count.mockResolvedValue(4);
      prismaMock.reportPhoto.create.mockResolvedValue({
        id: 'new-photo-id',
        reportId: testReport.id,
        photoUrl: '/uploads/reports/new-photo.jpg',
        thumbnailUrl: '/uploads/thumbs/new-photo.jpg',
        isPrimary: false,
        aiAnalysis: null,
        createdAt: new Date(),
      });

      const res = await app
        .post(`/api/reports/${testReport.id}/photos`)
        .set('Authorization', authHeader())
        .attach('photos', tinyPng, 'photo.png');

      expect(res.status).toBe(201);
    });
  });

  // ── GET /api/reports/mine 페이지네이션 ──
  describe('GET /api/reports/mine — 페이지네이션', () => {
    it('page/limit 파라미터 적용 확인', async () => {
      prismaMock.report.findMany.mockResolvedValue([]);
      prismaMock.report.count.mockResolvedValue(0);

      const res = await app
        .get('/api/reports/mine?page=3&limit=10')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,  // (3-1) * 10
          take: 10,
        }),
      );
    });

    it('기본값 page=1, limit=20 적용', async () => {
      prismaMock.report.findMany.mockResolvedValue([testReport]);
      prismaMock.report.count.mockResolvedValue(1);

      const res = await app
        .get('/api/reports/mine')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('페이지네이션 응답 형식 확인', async () => {
      prismaMock.report.findMany.mockResolvedValue([testReport]);
      prismaMock.report.count.mockResolvedValue(25);

      const res = await app
        .get('/api/reports/mine?page=2&limit=10')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('reports');
      expect(Array.isArray(res.body.reports)).toBe(true);
      expect(res.body).toHaveProperty('total', 25);
      expect(res.body).toHaveProperty('page', 2);
      expect(res.body).toHaveProperty('totalPages', 3); // ceil(25/10)
    });

    it('userId로 본인 신고만 조회', async () => {
      const userId = 'test-user-id';
      prismaMock.report.findMany.mockResolvedValue([testReport]);
      prismaMock.report.count.mockResolvedValue(1);

      await app
        .get('/api/reports/mine')
        .set('Authorization', authHeader(userId));

      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
        }),
      );
      expect(prismaMock.report.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
        }),
      );
    });

    it('limit 상한 50 초과 → 400', async () => {
      const res = await app
        .get('/api/reports/mine?limit=100')
        .set('Authorization', authHeader());

      expect(res.status).toBe(400);
    });
  });
});
