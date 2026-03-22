import type { Prisma, RewardType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/client.js';
import {
  XP_ACTIONS,
  LEVEL_REWARDS,
  type XpActionType,
} from '@findthem/shared';
import { computeSponsorLevel, utcDayStart } from '@findthem/shared';
import type { XpGrantResult } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('xpService');

/** 일일 한도 초과 에러 */
export class XpDailyLimitError extends Error {
  constructor() {
    super('XP_DAILY_LIMIT_REACHED');
  }
}

/**
 * 사용자에게 XP를 지급한다.
 * - dailyLimit 체크 → xp_log INSERT → user XP/레벨 갱신 → 레벨업 보상
 * - 외부 tx 전달 시 해당 tx 내에서 실행, 없으면 자체 $transaction
 *
 * @returns XpGrantResult or null if xpAmount <= 0
 * @throws XpDailyLimitError 일일 한도 초과 시
 */
export async function grantXp(
  userId: string,
  action: XpActionType,
  options?: {
    sourceId?: string;
    xpOverride?: number;
    tx?: Prisma.TransactionClient;
  },
): Promise<XpGrantResult | null> {
  const config = XP_ACTIONS[action];
  const xpAmount = options?.xpOverride ?? config.xp;
  if (xpAmount <= 0) return null;

  const execute = async (tx: Prisma.TransactionClient): Promise<XpGrantResult> => {
    // 1. 일일 한도 체크 + XP 로그 기록 (조건부 INSERT로 원자화)
    //    READ COMMITTED에서 count→create TOCTOU를 방지하기 위해
    //    INSERT ... WHERE (SELECT count) < limit 패턴 사용
    //    ⚠️ 테이블명 "xp_log"은 schema.prisma의 XpLog @@map("xp_log")과 동기 필수
    if (config.dailyLimit !== null) {
      const todayStart = utcDayStart();
      const inserted = await tx.$executeRaw`
        INSERT INTO "xp_log" ("id", "userId", "action", "xpAmount", "sourceId", "createdAt")
        SELECT ${randomUUID()},
               ${userId}, ${action}, ${xpAmount}::int,
               ${options?.sourceId ?? null}, NOW()
        WHERE (
          SELECT COUNT(*) FROM "xp_log"
          WHERE "userId" = ${userId} AND "action" = ${action} AND "createdAt" >= ${todayStart}
        ) < ${config.dailyLimit}
      `;
      if (inserted === 0) {
        throw new XpDailyLimitError();
      }
    } else {
      // 한도 없는 액션: 직접 INSERT
      await tx.xpLog.create({
        data: { userId, action, xpAmount, sourceId: options?.sourceId },
      });
    }

    // 2. XP 갱신
    //    SELECT FOR UPDATE로 현재값을 잠금 읽기 후 갱신
    //    → 동시 요청 시 XP 손실 및 레벨업 누락 방지
    //    ⚠️ 테이블명 "user"는 schema.prisma의 User @@map("user")과 동기 필수
    const [locked] = await tx.$queryRaw<[{ xp: number }]>`
      SELECT "xp" FROM "user" WHERE id = ${userId} FOR UPDATE
    `;
    const prevXp = locked.xp;
    const newXp = prevXp + xpAmount;
    const prevSnap = computeSponsorLevel(prevXp);
    const newSnap = computeSponsorLevel(newXp);
    const leveledUp = newSnap.level > prevSnap.level;

    await tx.user.update({
      where: { id: userId },
      data: {
        xp: newXp,
        ...(leveledUp ? { level: newSnap.level } : {}),
      },
    });

    // 4. 레벨업 보상
    let reward: { type: string; value: string; label: string } | undefined;
    if (leveledUp && LEVEL_REWARDS[newSnap.level]) {
      reward = LEVEL_REWARDS[newSnap.level];
      await tx.userReward.upsert({
        where: { userId_level: { userId, level: newSnap.level } },
        update: {},
        create: {
          userId,
          level: newSnap.level,
          rewardType: reward.type as RewardType,
          rewardValue: reward.value,
        },
      });
      log.info({ userId, action, newLevel: newSnap.level, reward }, 'Level up reward granted');
    }

    return { xpGained: xpAmount, newXp, newLevel: newSnap.level, leveledUp, reward };
  };

  if (options?.tx) {
    return execute(options.tx);
  }
  return prisma.$transaction(execute);
}
