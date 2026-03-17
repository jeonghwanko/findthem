import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { validateBody } from '../middlewares/validate.js';
import {
  ERROR_CODES,
  MAX_FREE_PLAYS_PER_DAY,
  MAX_AD_PLAYS_PER_DAY,
} from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('game');

const VALID_CHARACTERS = ['image-matching', 'promotion', 'chatbot-alert'] as const;

function utcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const recordPlaySchema = z.object({
  character: z.enum(VALID_CHARACTERS),
  score: z.number().int().min(0).max(999999),
  usedAd: z.boolean().default(false),
});

export function registerGameRoutes(router: Router) {
  // GET /game/status — 오늘 플레이 현황 조회
  router.get('/game/status', optionalAuth, async (req, res) => {
    const userId = req.user?.userId ?? null;
    const today = utcDayStart();

    if (!userId) {
      // 비로그인은 서버에서 추적 불가 → 0/0 반환, 프론트에서 localStorage로 관리
      res.json({
        freePlaysToday: 0,
        adPlaysToday: 0,
        maxFreePlays: MAX_FREE_PLAYS_PER_DAY,
        maxAdPlays: MAX_AD_PLAYS_PER_DAY,
        remainingFree: MAX_FREE_PLAYS_PER_DAY,
        remainingAd: MAX_AD_PLAYS_PER_DAY,
      });
      return;
    }

    const [freeCount, adCount] = await Promise.all([
      prisma.gamePlay.count({ where: { userId, usedAd: false, playedAt: { gte: today } } }),
      prisma.gamePlay.count({ where: { userId, usedAd: true, playedAt: { gte: today } } }),
    ]);

    res.json({
      freePlaysToday: freeCount,
      adPlaysToday: adCount,
      maxFreePlays: MAX_FREE_PLAYS_PER_DAY,
      maxAdPlays: MAX_AD_PLAYS_PER_DAY,
      remainingFree: Math.max(0, MAX_FREE_PLAYS_PER_DAY - freeCount),
      remainingAd: Math.max(0, MAX_AD_PLAYS_PER_DAY - adCount),
    });
  });

  // POST /game/play — 플레이 기록 + 한도 체크 (원자적)
  router.post('/game/play', optionalAuth, validateBody(recordPlaySchema), async (req, res) => {
    const { character, score, usedAd } = req.body as z.infer<typeof recordPlaySchema>;
    const userId = req.user?.userId ?? null;
    const today = utcDayStart();

    if (!userId) {
      res.json({ ok: true, xpEarned: 0 });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (usedAd) {
        const adCount = await tx.gamePlay.count({
          where: { userId, usedAd: true, playedAt: { gte: today } },
        });
        if (adCount >= MAX_AD_PLAYS_PER_DAY) {
          throw new ApiError(429, ERROR_CODES.GAME_PLAY_LIMIT_REACHED);
        }
      } else {
        const freeCount = await tx.gamePlay.count({
          where: { userId, usedAd: false, playedAt: { gte: today } },
        });
        if (freeCount >= MAX_FREE_PLAYS_PER_DAY) {
          throw new ApiError(429, ERROR_CODES.GAME_PLAY_LIMIT_REACHED);
        }
      }

      await tx.gamePlay.create({
        data: { userId, character, score, usedAd },
      });
    });

    log.info({ userId, character, score, usedAd }, 'Game play recorded');
    res.json({ ok: true, xpEarned: 0 });
  });
}
