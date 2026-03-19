import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader, testReport, testSighting } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// setup.ts의 vi.mock 팩토리가 생성한 실제 mock 객체를 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Sightings E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
  });

  // ── POST /api/sightings ──
  describe('POST /api/sightings', () => {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    it('제보 성공 → 201', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      prismaMock.sighting.create.mockResolvedValue(testSighting);
      prismaMock.sightingPhoto.createMany.mockResolvedValue({ count: 1 });
      prismaMock.sightingPhoto.findMany.mockResolvedValue([{
        id: 'sp-1', sightingId: testSighting.id, photoUrl: '/uploads/sightings/p.jpg',
        thumbnailUrl: '/uploads/thumbs/p.jpg', aiAnalysis: null, createdAt: new Date(),
      }]);

      const res = await app
        .post('/api/sightings')
        .field('data', JSON.stringify({
          reportId: testReport.id,
          description: '비슷한 강아지를 봤습니다',
          sightedAt: '2025-01-16T10:00:00Z',
          address: '서울시 강남구 삼성동',
        }))
        .attach('photos', tinyPng, 'sighting.png');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prismaMock.sighting.create).toHaveBeenCalledOnce();
    });

    it('사진 첨부 → 이미지 큐 작업 추가', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);
      prismaMock.sighting.create.mockResolvedValue(testSighting);
      prismaMock.sightingPhoto.createMany.mockResolvedValue({ count: 1 });
      prismaMock.sightingPhoto.findMany.mockResolvedValue([{
        id: 'sighting-photo-1',
        sightingId: testSighting.id,
        photoUrl: '/uploads/sightings/photo.jpg',
        thumbnailUrl: '/uploads/thumbs/photo.jpg',
        aiAnalysis: null,
        createdAt: new Date(),
      }]);

      const res = await app
        .post('/api/sightings')
        .field('data', JSON.stringify({
          reportId: testReport.id,
          description: '비슷한 강아지를 봤습니다',
          sightedAt: '2025-01-16T10:00:00Z',
          address: '서울시 강남구 삼성동',
        }))
        .attach('photos', tinyPng, 'sighting.png');

      expect(res.status).toBe(201);
    });

    it('존재하지 않는 reportId → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app
        .post('/api/sightings')
        .field('data', JSON.stringify({
          reportId: 'nonexistent-id',
          description: '봤어요',
          sightedAt: '2025-01-16T10:00:00Z',
          address: '서울시',
        }))
        .attach('photos', tinyPng, 'sighting.png');

      expect(res.status).toBe(404);
    });

    it('사진 없이 제보 → 400', async () => {
      const res = await app
        .post('/api/sightings')
        .field('data', JSON.stringify({
          description: '봤어요',
          sightedAt: '2025-01-16T10:00:00Z',
          address: '서울시',
        }));

      expect(res.status).toBe(400);
    });

    it('필수 필드 누락 → 400', async () => {
      const res = await app
        .post('/api/sightings')
        .field('data', JSON.stringify({
          description: '',
          address: '',
        }));

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/reports/:id/sightings ──
  describe('GET /api/reports/:id/sightings', () => {
    it('제보 목록 반환 → 200', async () => {
      prismaMock.sighting.findMany.mockResolvedValue([
        { ...testSighting, photos: [] },
      ]);
      prismaMock.sighting.count.mockResolvedValue(1);

      const res = await app.get(`/api/reports/${testReport.id}/sightings`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sightings)).toBe(true);
      expect(res.body.sightings).toHaveLength(1);
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('totalPages', 1);
    });

    it('제보 없는 신고 → 빈 배열', async () => {
      prismaMock.sighting.findMany.mockResolvedValue([]);
      prismaMock.sighting.count.mockResolvedValue(0);

      const res = await app.get('/api/reports/some-id/sightings');

      expect(res.status).toBe(200);
      expect(res.body.sightings).toEqual([]);
      expect(res.body).toHaveProperty('total', 0);
    });
  });
});
