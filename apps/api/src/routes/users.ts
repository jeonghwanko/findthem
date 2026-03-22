import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { createLogger } from '../logger.js';
import {
  ERROR_CODES,
  AD_REWARD_COOLDOWN_SECS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@findthem/shared';
import { computeSponsorLevel } from '@findthem/shared';
import type { XpStats } from '@findthem/shared';
import { grantXp, XpDailyLimitError } from '../services/xpService.js';

const log = createLogger('usersRoute');

const adRewardLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'RATE_LIMIT_EXCEEDED' });

export function registerUserRoutes(router: Router) {
  // GET /users/me/xp-stats — 내 후원XP & 레벨 조회
  router.get('/users/me/xp-stats', requireAuth, async (req, res) => {
    const { userId } = req.user!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true },
    });
    if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND);

    const snap = computeSponsorLevel(user.xp);

    const stats: XpStats = {
      xp: user.xp,
      level: snap.level,
      currentXP: snap.currentXP,
      xpToNextLevel: snap.xpToNextLevel,
      xpRequiredForLevel: snap.currentXP + snap.xpToNextLevel,
    };

    res.json(stats);
  });

  // POST /users/me/ad-reward — 광고 시청 후 후원XP 지급
  router.post('/users/me/ad-reward', requireAuth, adRewardLimiter, async (req, res) => {
    const { userId } = req.user!;

    const result = await prisma.$transaction(async (tx) => {
      // 1. 쿨다운 슬롯을 원자적으로 선점 (READ COMMITTED 레이스 컨디션 방지)
      const cooldownCutoff = new Date(Date.now() - AD_REWARD_COOLDOWN_SECS * 1000);
      const claimed = await tx.$executeRaw`
        UPDATE "user"
        SET "xpLastAt" = NOW()
        WHERE id = ${userId}
          AND (
            "xpLastAt" IS NULL
            OR "xpLastAt" < ${cooldownCutoff}
          )
      `;
      if (claimed === 0) throw new ApiError(429, ERROR_CODES.AD_REWARD_COOLDOWN);

      // 2. grantXp로 XP 지급 + 레벨업 처리
      const xpResult = await grantXp(userId, 'AD_WATCH', { tx });
      return xpResult ?? { xpGained: 0, newXp: 0, newLevel: 1, leveledUp: false };
    });

    res.json(result);
  });

  // POST /users/me/share-reward — 공유 시 XP 지급
  const shareLimiter = rateLimit({ windowMs: 60_000, max: 10 });
  router.post('/users/me/share-reward', requireAuth, shareLimiter, async (req, res) => {
    const { userId } = req.user!;
    try {
      const result = await grantXp(userId, 'SHARE');
      res.json(result ?? { xpGained: 0, newXp: 0, newLevel: 1, leveledUp: false });
    } catch (err) {
      if (err instanceof XpDailyLimitError || (err instanceof Error && err.message === 'XP_DAILY_LIMIT_REACHED')) {
        throw new ApiError(429, ERROR_CODES.XP_DAILY_LIMIT_REACHED);
      }
      throw err;
    }
  });

  // GET /users/me/xp-history — XP 획득 이력
  const xpHistorySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  });

  router.get('/users/me/xp-history', requireAuth, validateQuery(xpHistorySchema), async (req, res) => {
    const { userId } = req.user!;
    const { page, limit } = req.query as unknown as z.infer<typeof xpHistorySchema>;

    const [items, total] = await Promise.all([
      prisma.xpLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.xpLog.count({ where: { userId } }),
    ]);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  });

  // POST /users/me/fcm-token — FCM 토큰 저장
  const fcmTokenSchema = z.object({ token: z.string().min(1) });

  router.post('/users/me/fcm-token', requireAuth, validateBody(fcmTokenSchema), async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;
    const { token } = req.body as z.infer<typeof fcmTokenSchema>;

    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });

    res.status(204).send();
  });
}
