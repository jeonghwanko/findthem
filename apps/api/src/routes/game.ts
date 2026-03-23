import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import {
  ERROR_CODES,
  VALID_AGENT_IDS,
  GAME_LIMITS,
  GAME_TYPES,
} from '@findthem/shared';
import { utcDayStart } from '@findthem/shared';
import { rateLimit } from '../middlewares/rateLimit.js';
import { createLogger } from '../logger.js';

const log = createLogger('game');

const gameTypeValues = [GAME_TYPES.STAIR, GAME_TYPES.FIND] as const;

const statusQuerySchema = z.object({
  gameType: z.enum(gameTypeValues).default(GAME_TYPES.STAIR),
});

const recordPlaySchema = z.object({
  character: z.enum(VALID_AGENT_IDS),
  score: z.number().int().min(0).max(999999),
  usedAd: z.boolean().default(false),
  gameType: z.enum(gameTypeValues).default(GAME_TYPES.STAIR),
});

const gameLimiter = rateLimit({ windowMs: 60_000, max: 30 });

export function registerGameRoutes(router: Router) {
  // GET /game/status — 오늘 플레이 현황 조회
  router.get('/game/status', optionalAuth, validateQuery(statusQuerySchema), async (req, res) => {
    const userId = req.user?.userId ?? null;
    const { gameType } = req.query as z.infer<typeof statusQuerySchema>;
    const today = utcDayStart();
    const limits = GAME_LIMITS[gameType];

    if (!userId) {
      res.json({
        freePlaysToday: 0,
        adPlaysToday: 0,
        maxFreePlays: limits.free,
        maxAdPlays: limits.ad,
        remainingFree: limits.free,
        remainingAd: limits.ad,
      });
      return;
    }

    const [freeCount, adCount] = await Promise.all([
      prisma.gamePlay.count({ where: { userId, usedAd: false, gameType, playedAt: { gte: today } } }),
      prisma.gamePlay.count({ where: { userId, usedAd: true, gameType, playedAt: { gte: today } } }),
    ]);

    res.json({
      freePlaysToday: freeCount,
      adPlaysToday: adCount,
      maxFreePlays: limits.free,
      maxAdPlays: limits.ad,
      remainingFree: Math.max(0, limits.free - freeCount),
      remainingAd: Math.max(0, limits.ad - adCount),
    });
  });

  // POST /game/play — 플레이 기록 + 한도 체크 (원자적)
  router.post('/game/play', gameLimiter, optionalAuth, validateBody(recordPlaySchema), async (req, res) => {
    const { character, score, usedAd, gameType } = req.body as z.infer<typeof recordPlaySchema>;
    const userId = req.user?.userId ?? null;
    const today = utcDayStart();
    const limits = GAME_LIMITS[gameType];

    if (!userId) {
      res.json({ ok: true, xpEarned: 0 });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (usedAd) {
        const adCount = await tx.gamePlay.count({
          where: { userId, usedAd: true, gameType, playedAt: { gte: today } },
        });
        if (adCount >= limits.ad) {
          throw new ApiError(429, ERROR_CODES.GAME_PLAY_LIMIT_REACHED);
        }
      } else {
        const freeCount = await tx.gamePlay.count({
          where: { userId, usedAd: false, gameType, playedAt: { gte: today } },
        });
        if (freeCount >= limits.free) {
          throw new ApiError(429, ERROR_CODES.GAME_PLAY_LIMIT_REACHED);
        }
      }

      await tx.gamePlay.create({
        data: { userId, character, score, usedAd, gameType },
      });
    });

    log.info({ userId, character, score, usedAd, gameType }, 'Game play recorded');
    res.json({ ok: true, xpEarned: 0 });
  });
}
