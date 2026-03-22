import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Game E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
  });

  // ── GET /api/game/status ──
  describe('GET /api/game/status', () => {
    it('비인증 → 기본값 반환 200', async () => {
      const res = await app.get('/api/game/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('maxFreePlays');
      expect(res.body).toHaveProperty('maxAdPlays');
      expect(res.body.freePlaysToday).toBe(0);
      expect(res.body.adPlaysToday).toBe(0);
    });

    it('인증 → DB 기준 카운트 반환', async () => {
      prismaMock.gamePlay.count
        .mockResolvedValueOnce(1)   // free plays
        .mockResolvedValueOnce(0);  // ad plays

      const res = await app
        .get('/api/game/status')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.freePlaysToday).toBe(1);
      expect(res.body.adPlaysToday).toBe(0);
      expect(res.body.remainingFree).toBe(0); // MAX_FREE_PLAYS_PER_DAY=1, 1 used
    });
  });

  // ── POST /api/game/play ──
  describe('POST /api/game/play', () => {
    const validBody = {
      character: 'image-matching',
      score: 42,
      usedAd: false,
    };

    it('비인증 플레이 → ok (서버 추적 안 함)', async () => {
      const res = await app.post('/api/game/play').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, xpEarned: 0 });
      // DB create 호출 안 됨
      expect(prismaMock.gamePlay.create).not.toHaveBeenCalled();
    });

    it('인증 플레이 → DB 기록 + ok', async () => {
      prismaMock.gamePlay.count.mockResolvedValue(0); // 한도 내
      prismaMock.gamePlay.create.mockResolvedValue({ id: 'gp-1' });

      const res = await app
        .post('/api/game/play')
        .set('Authorization', authHeader())
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(prismaMock.gamePlay.create).toHaveBeenCalled();
    });

    it('일일 한도 초과 → 429', async () => {
      prismaMock.gamePlay.count.mockResolvedValue(99); // 한도 초과

      const res = await app
        .post('/api/game/play')
        .set('Authorization', authHeader())
        .send(validBody);

      expect(res.status).toBe(429);
    });

    it('광고 플레이 한도 초과 → 429', async () => {
      prismaMock.gamePlay.count.mockResolvedValue(99);

      const res = await app
        .post('/api/game/play')
        .set('Authorization', authHeader())
        .send({ character: 'image-matching', score: 10, usedAd: true });

      expect(res.status).toBe(429);
    });

    it('잘못된 character → 400', async () => {
      const res = await app
        .post('/api/game/play')
        .set('Authorization', authHeader())
        .send({ character: 'invalid-agent', score: 10 });

      expect(res.status).toBe(400);
    });

    it('음수 score → 400', async () => {
      const res = await app
        .post('/api/game/play')
        .set('Authorization', authHeader())
        .send({ character: 'image-matching', score: -1 });

      expect(res.status).toBe(400);
    });
  });
});
