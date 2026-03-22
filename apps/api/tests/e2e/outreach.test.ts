import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Outreach Highlights E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/outreach/highlights', () => {
    it('인증 없이 접근 가능 → 200', async () => {
      prismaMock.outreachRequest.findMany.mockResolvedValue([]);

      const res = await app.get('/api/outreach/highlights');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toEqual([]);
    });

    it('유튜버 하이라이트 반환', async () => {
      prismaMock.outreachRequest.findMany.mockResolvedValue([
        {
          reportId: 'r1',
          status: 'SENT',
          contact: {
            name: '유튜버A',
            type: 'VIDEO',
            videoId: 'abc12345678',
            videoTitle: '실종견 발견 제보',
            viewCount: 15000,
            youtubeChannelId: null,
            youtubeChannelUrl: null,
          },
        },
      ]);

      const res = await app.get('/api/outreach/highlights');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        videoId: 'abc12345678',
        channelName: '유튜버A',
        reportId: 'r1',
      });
    });

    it('유효하지 않은 videoId 필터링', async () => {
      prismaMock.outreachRequest.findMany.mockResolvedValue([
        {
          reportId: 'r1',
          status: 'SENT',
          contact: {
            name: '유튜버B',
            type: 'VIDEO',
            videoId: '<script>xss</script>', // 유효하지 않은 videoId
            videoTitle: 'test',
            viewCount: 0,
            youtubeChannelId: null,
            youtubeChannelUrl: null,
          },
        },
      ]);

      const res = await app.get('/api/outreach/highlights');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });

    it('중복 채널 제거', async () => {
      const contact = {
        name: '유튜버C',
        type: 'VIDEO' as const,
        videoId: 'def12345678',
        videoTitle: '영상1',
        viewCount: 1000,
        youtubeChannelId: null,
        youtubeChannelUrl: null,
      };
      prismaMock.outreachRequest.findMany.mockResolvedValue([
        { reportId: 'r1', status: 'SENT', contact },
        { reportId: 'r2', status: 'SENT', contact }, // 같은 videoId
      ]);

      const res = await app.get('/api/outreach/highlights');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });
  });
});
