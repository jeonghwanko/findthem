import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { validateBody } from '../middlewares/validate.js';
import { createLogger } from '../logger.js';
import {
  ERROR_CODES,
  XP_PER_AD,
  AD_REWARD_COOLDOWN_SECS,
  LEVEL_REWARDS,
} from '@findthem/shared';
import { computeSponsorLevel } from '@findthem/shared';
import type { AdRewardResult, SponsorXpStats } from '@findthem/shared';

const log = createLogger('usersRoute');

export function registerUserRoutes(router: Router) {
  // GET /users/me/xp-stats — 내 후원XP & 레벨 조회
  router.get('/users/me/xp-stats', requireAuth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sponsorXp: true, userLevel: true },
    });
    if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND);

    const snap = computeSponsorLevel(user.sponsorXp);

    const stats: SponsorXpStats = {
      sponsorXp: user.sponsorXp,
      userLevel: snap.level,
      currentXP: snap.currentXP,
      xpToNextLevel: snap.xpToNextLevel,
      xpRequiredForLevel: snap.currentXP + snap.xpToNextLevel,
    };

    res.json(stats);
  });

  // POST /users/me/ad-reward — 광고 시청 후 후원XP 지급
  router.post('/users/me/ad-reward', requireAuth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;

    const result = await prisma.$transaction(async (tx) => {
      // 1. 쿨다운 슬롯을 원자적으로 선점 (READ COMMITTED 레이스 컨디션 방지)
      //    $executeRaw 조건부 UPDATE: 쿨다운이 지난 경우에만 sponsorXpLastAt 갱신
      const cooldownCutoff = new Date(Date.now() - AD_REWARD_COOLDOWN_SECS * 1000);
      const claimed = await tx.$executeRaw`
        UPDATE "user"
        SET "sponsorXpLastAt" = NOW()
        WHERE id = ${userId}
          AND (
            "sponsorXpLastAt" IS NULL
            OR "sponsorXpLastAt" < ${cooldownCutoff}
          )
      `;
      if (claimed === 0) throw new ApiError(429, ERROR_CODES.AD_REWARD_COOLDOWN);

      // 2. XP 계산 및 업데이트
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { sponsorXp: true },
      });
      if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND);

      const prevXp = user.sponsorXp;
      const newXp = prevXp + XP_PER_AD;
      const prevSnap = computeSponsorLevel(prevXp);
      const newSnap = computeSponsorLevel(newXp);
      const leveledUp = newSnap.level > prevSnap.level;

      await tx.user.update({
        where: { id: userId },
        data: { sponsorXp: newXp, userLevel: newSnap.level },
      });

      // 3. 레벨업 보상 지급 (중복 방지: upsert)
      let reward: { type: string; value: string; label: string } | undefined;
      if (leveledUp && LEVEL_REWARDS[newSnap.level]) {
        reward = LEVEL_REWARDS[newSnap.level];
        await tx.userReward.upsert({
          where: { userId_level: { userId, level: newSnap.level } },
          update: {},
          create: {
            userId,
            level: newSnap.level,
            rewardType: reward.type,
            rewardValue: reward.value,
          },
        });
        log.info({ userId, newLevel: newSnap.level, reward }, 'Level up reward granted');
      }

      const adResult: AdRewardResult = {
        newXp,
        newLevel: newSnap.level,
        leveledUp,
        xpGained: XP_PER_AD,
        reward,
      };
      return adResult;
    });

    res.json(result);
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
