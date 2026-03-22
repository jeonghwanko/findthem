import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

const testReport = {
  id: 'report-og-1',
  name: '초코',
  subjectType: 'DOG',
  features: '갈색 푸들, 빨간 목줄',
  status: 'ACTIVE',
  lastSeenAddress: '서울시 강남구',
  photos: [{ photoUrl: '/uploads/reports/photo1.jpg' }],
};

describe('OG Meta E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/og/reports/:id', () => {
    it('유효한 신고 → OG HTML 200', async () => {
      prismaMock.report.findUnique.mockResolvedValue(testReport);

      const res = await app.get('/api/og/reports/report-og-1');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('og:title');
      expect(res.text).toContain('초코');
      expect(res.text).toContain('og:image');
    });

    it('FOUND 상태 → [찾았습니다] 타이틀', async () => {
      prismaMock.report.findUnique.mockResolvedValue({ ...testReport, status: 'FOUND' });

      const res = await app.get('/api/og/reports/report-og-1');

      expect(res.status).toBe(200);
      expect(res.text).toContain('찾았습니다');
    });

    it('없는 신고 → 404', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      const res = await app.get('/api/og/reports/nonexistent');

      expect(res.status).toBe(404);
    });

    it('사진 없는 신고 → 기본 이미지 사용', async () => {
      prismaMock.report.findUnique.mockResolvedValue({ ...testReport, photos: [] });

      const res = await app.get('/api/og/reports/report-og-1');

      expect(res.status).toBe(200);
      expect(res.text).toContain('pwa-512x512.png');
    });

    it('XSS 방지 — HTML 이스케이프', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        ...testReport,
        name: '<script>alert("xss")</script>',
      });

      const res = await app.get('/api/og/reports/report-og-1');

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('<script>');
      expect(res.text).toContain('&lt;script&gt;');
    });
  });
});
