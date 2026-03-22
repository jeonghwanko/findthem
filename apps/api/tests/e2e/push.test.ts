import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Push E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
  });

  // ── GET /api/push/vapid-key ──
  describe('GET /api/push/vapid-key', () => {
    it('VAPID 공개키 반환 → 200', async () => {
      const res = await app.get('/api/push/vapid-key');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('publicKey');
    });
  });

  // ── POST /api/push/subscribe ──
  describe('POST /api/push/subscribe', () => {
    it('인증 필수 → 401', async () => {
      const res = await app
        .post('/api/push/subscribe')
        .send({ endpoint: 'https://push.example.com/sub1', p256dh: 'key1', auth: 'auth1' });
      expect(res.status).toBe(401);
    });

    it('유효한 구독 → 201', async () => {
      prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 'sub-1' });

      const res = await app
        .post('/api/push/subscribe')
        .set('Authorization', authHeader())
        .send({ endpoint: 'https://push.example.com/sub1', p256dh: 'key1', auth: 'auth1' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(prismaMock.pushSubscription.upsert).toHaveBeenCalled();
    });

    it('endpoint 누락 → 400', async () => {
      const res = await app
        .post('/api/push/subscribe')
        .set('Authorization', authHeader())
        .send({ p256dh: 'key1', auth: 'auth1' });
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/push/unsubscribe ──
  describe('DELETE /api/push/unsubscribe', () => {
    it('인증 필수 → 401', async () => {
      const res = await app
        .delete('/api/push/unsubscribe?endpoint=https://push.example.com/sub1');
      expect(res.status).toBe(401);
    });

    it('유효한 해제 → 200', async () => {
      prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      const res = await app
        .delete('/api/push/unsubscribe?endpoint=https://push.example.com/sub1')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
