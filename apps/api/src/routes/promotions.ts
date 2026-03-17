import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { validateBody } from '../middlewares/validate.js';
import { promotionQueue } from '../jobs/queues.js';
import { ERROR_CODES, MAX_BOOSTS_PER_DAY, type PromoPlatform } from '@findthem/shared';

// UTC 기준 오늘 자정 (서버 로컬 타임존 의존 방지)
function utcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const repostBodySchema = z.object({
  platforms: z.array(z.enum(['TWITTER', 'KAKAO_CHANNEL'])).optional(),
  regenerateContent: z.boolean().optional().default(true),
});

export function registerPromotionRoutes(router: Router) {
  // GET /reports/:id/promotions — 신고의 홍보 이력 조회 (본인 신고만)
  router.get('/reports/:id/promotions', requireAuth, async (req, res) => {
    const reportId = req.params['id'] as string;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!; // requireAuth가 보장

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, userId: true },
    });

    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
    if (report.userId !== userId) throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);

    const [strategy, promotions, logs] = await Promise.all([
      prisma.promotionStrategy.findUnique({
        where: { reportId },
      }),
      prisma.promotion.findMany({
        where: { reportId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.promotionLog.findMany({
        where: { reportId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    res.json({ strategy, promotions, logs });
  });

  // POST /reports/:id/promotions/repost — 수동 재홍보 (본인 신고만)
  router.post(
    '/reports/:id/promotions/repost',
    requireAuth,
    validateBody(repostBodySchema),
    async (req, res) => {
      const reportId = req.params['id'] as string;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { userId } = req.user!; // requireAuth가 보장
      const { platforms, regenerateContent } = req.body as z.infer<typeof repostBodySchema>;

      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: { id: true, userId: true, status: true },
      });

      if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
      if (report.userId !== userId) throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);
      if (report.status !== 'ACTIVE') {
        throw new ApiError(400, ERROR_CODES.REPORT_STATUS_INVALID);
      }

      // 현재 버전 파악 (가장 최신 POSTED/DELETED promotion의 version)
      const latestPromotion = await prisma.promotion.findFirst({
        where: { reportId, status: { in: ['POSTED', 'DELETED'] } },
        orderBy: { createdAt: 'desc' },
        select: { version: true },
      });

      const nextVersion = (latestPromotion?.version ?? 0) + 1;

      // 요청된 platforms 또는 strategy의 targetPlatforms 사용
      let targetPlatforms: PromoPlatform[] | undefined = platforms as PromoPlatform[] | undefined;

      if (!targetPlatforms || targetPlatforms.length === 0) {
        const strategy = await prisma.promotionStrategy.findUnique({
          where: { reportId },
          select: { targetPlatforms: true },
        });
        if (strategy?.targetPlatforms && strategy.targetPlatforms.length > 0) {
          targetPlatforms = strategy.targetPlatforms as PromoPlatform[];
        }
      }

      // 기존 POSTED Promotion → DELETED 처리 (큐 등록 전 — 크래시 시 재게시 gap 최소화)
      await prisma.promotion.updateMany({
        where: {
          reportId,
          ...(targetPlatforms
            ? { platform: { in: targetPlatforms } }
            : {}),
          status: 'POSTED',
        },
        data: { status: 'DELETED' },
      });

      // promotionQueue에 재게시 job 등록
      // RACE-05: jobId로 동일 버전의 중복 job 방지
      await promotionQueue.add(
        'manual-repost',
        {
          reportId,
          isRepost: true,
          version: nextVersion,
          platforms: targetPlatforms,
          regenerateContent,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          jobId: `repost-${reportId}-v${nextVersion}`,
        },
      );

      // 수동 재게시 로그 기록
      await prisma.promotionLog.create({
        data: {
          reportId,
          action: 'manual_repost_requested',
          detail: {
            requestedBy: userId,
            version: nextVersion,
            platforms: targetPlatforms ?? 'all',
            regenerateContent,
          },
        },
      });

      res.json({ ok: true, version: nextVersion });
    },
  );

  // GET /reports/:id/boost-status — 오늘 부스트 잔여 횟수 조회
  router.get('/reports/:id/boost-status', requireAuth, async (req, res) => {
    const reportId = req.params['id'] as string;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, userId: true },
    });

    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
    if (report.userId !== userId) throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);

    const todayStart = utcDayStart();

    const boostsUsedToday = await prisma.promotionLog.count({
      where: {
        reportId,
        action: 'ad_boost',
        createdAt: { gte: todayStart },
      },
    });

    res.json({ boostsUsedToday, maxBoosts: MAX_BOOSTS_PER_DAY });
  });

  // POST /reports/:id/boost — 광고 시청 후 SNS 재홍보 부스트
  router.post('/reports/:id/boost', requireAuth, async (req, res) => {
    const reportId = req.params['id'] as string;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, userId: true, status: true },
    });

    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
    if (report.userId !== userId) throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);
    if (report.status !== 'ACTIVE') {
      throw new ApiError(400, ERROR_CODES.REPORT_STATUS_INVALID);
    }

    const todayStart = utcDayStart();

    // 레이스 컨디션 방지: 카운트 + 로그 생성을 트랜잭션으로 원자적 처리
    const boostsUsedToday = await prisma.$transaction(async (tx) => {
      const count = await tx.promotionLog.count({
        where: { reportId, action: 'ad_boost', createdAt: { gte: todayStart } },
      });

      if (count >= MAX_BOOSTS_PER_DAY) {
        throw new ApiError(429, ERROR_CODES.BOOST_LIMIT_REACHED);
      }

      // 현재 버전 파악
      const latestPromotion = await tx.promotion.findFirst({
        where: { reportId, status: { in: ['POSTED', 'DELETED'] } },
        orderBy: { createdAt: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latestPromotion?.version ?? 0) + 1;

      // strategy의 targetPlatforms 사용
      const strategy = await tx.promotionStrategy.findUnique({
        where: { reportId },
        select: { targetPlatforms: true },
      });
      const targetPlatforms =
        strategy?.targetPlatforms && strategy.targetPlatforms.length > 0
          ? (strategy.targetPlatforms as PromoPlatform[])
          : undefined;

      // 부스트 로그 먼저 기록 (한도 선점) — 큐 등록 전
      await tx.promotionLog.create({
        data: {
          reportId,
          action: 'ad_boost',
          detail: {
            requestedBy: userId,
            version: nextVersion,
            platforms: targetPlatforms ?? 'all',
          },
        },
      });

      return { count, nextVersion, targetPlatforms };
    });

    const { count, nextVersion, targetPlatforms } = boostsUsedToday;

    // 기존 POSTED Promotion → DELETED 처리 (큐 등록 전 — 크래시 시 재게시 gap 최소화)
    await prisma.promotion.updateMany({
      where: {
        reportId,
        ...(targetPlatforms ? { platform: { in: targetPlatforms } } : {}),
        status: 'POSTED',
      },
      data: { status: 'DELETED' },
    });

    // promotionQueue에 부스트 job 등록
    await promotionQueue.add(
      'ad-boost',
      {
        reportId,
        isRepost: true,
        version: nextVersion,
        platforms: targetPlatforms,
        regenerateContent: true,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        jobId: `boost-${reportId}-v${nextVersion}`,
      },
    );

    res.json({ ok: true, boostsRemaining: MAX_BOOSTS_PER_DAY - count - 1 });
  });
}
