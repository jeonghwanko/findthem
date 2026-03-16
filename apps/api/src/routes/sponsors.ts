import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { ApiError } from '../middlewares/errors.js';
import { ERROR_CODES } from '@findthem/shared';
import { createLogger } from '../logger.js';
import { randomUUID } from 'node:crypto';

const log = createLogger('sponsors');

const listQuerySchema = z.object({
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const prepareSchema = z.object({
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']),
});

const verifySchema = z.object({
  paymentKey: z.string(),
  orderId: z.string(),
  amount: z.number().int().min(100).max(1_000_000),
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']),
  displayName: z.string().max(30).optional(),
  message: z.string().max(100).optional(),
});

export function registerSponsorRoutes(router: Router) {
  // 후원자 목록 (최신순)
  router.get('/sponsors', validateQuery(listQuerySchema), async (req, res) => {
    const { agentId, limit } = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = agentId ? { agentId } : {};

    const sponsors = await prisma.sponsor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agentId: true,
        amount: true,
        displayName: true,
        message: true,
        createdAt: true,
      },
    });

    res.json(
      sponsors.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    );
  });

  // orderId 생성
  router.post('/sponsors/prepare', validateBody(prepareSchema), async (req, res) => {
    const { agentId } = req.body as z.infer<typeof prepareSchema>;
    const orderId = `${agentId}-${randomUUID()}`;

    log.info({ orderId, agentId }, 'Sponsor order prepared');

    res.json({ orderId });
  });

  // Toss 결제 확인 후 DB 저장
  router.post('/sponsors/verify', validateBody(verifySchema), async (req, res) => {
    const { paymentKey, orderId, amount, agentId, displayName, message } =
      req.body as z.infer<typeof verifySchema>;

    // 중복 검증 방지
    const existing = await prisma.sponsor.findUnique({ where: { orderId } });
    if (existing) {
      throw new ApiError(400, ERROR_CODES.ALREADY_VERIFIED);
    }

    // Toss API 호출 (secretKey 없으면 dev 환경에서 스킵)
    if (config.tossSecretKey) {
      const credentials = Buffer.from(`${config.tossSecretKey}:`).toString('base64');

      const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });

      if (!tossRes.ok) {
        const errBody = await tossRes.json().catch(() => ({}));
        log.warn({ orderId, status: tossRes.status, errBody }, 'Toss payment confirm failed');
        throw new ApiError(400, ERROR_CODES.PAYMENT_FAILED);
      }

      const tossData = (await tossRes.json()) as { totalAmount?: number };
      if (tossData.totalAmount !== amount) {
        log.warn(
          { orderId, expected: amount, received: tossData.totalAmount },
          'Toss amount mismatch',
        );
        throw new ApiError(400, ERROR_CODES.AMOUNT_MISMATCH);
      }
    } else {
      log.warn({ orderId }, 'TOSS_SECRET_KEY not set — skipping Toss API call (dev mode)');
    }

    await prisma.sponsor.create({
      data: { agentId, amount, orderId, paymentKey, displayName, message },
    });

    log.info({ orderId, agentId, amount }, 'Sponsor payment verified and saved');

    res.json({ success: true });
  });
}
