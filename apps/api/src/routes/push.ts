import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

const unsubscribeQuerySchema = z.object({
  endpoint: z.string().url(),
});

export function registerPushRoutes(router: Router) {
  // VAPID 공개키 조회 (프론트에서 구독 생성 시 사용)
  router.get('/push/vapid-key', (_req, res) => {
    res.json({ publicKey: config.vapidPublicKey });
  });

  // 푸시 구독 등록 (upsert)
  router.post('/push/subscribe', requireAuth, validateBody(subscribeSchema), async (req, res) => {
    const { userId } = req.user!;
    const { endpoint, p256dh, auth, userAgent } = req.body as z.infer<typeof subscribeSchema>;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, userAgent },
      update: { userId, p256dh, auth, userAgent },
    });

    res.status(201).json({ ok: true });
  });

  // 푸시 구독 해제 (?endpoint=...)
  router.delete(
    '/push/unsubscribe',
    requireAuth,
    validateQuery(unsubscribeQuerySchema),
    async (req, res) => {
      const { userId } = req.user!;
      const { endpoint } = req.query as z.infer<typeof unsubscribeQuerySchema>;
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
      res.json({ ok: true });
    },
  );
}
