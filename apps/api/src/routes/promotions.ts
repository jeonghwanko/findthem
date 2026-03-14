import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { validateBody } from '../middlewares/validate.js';
import { promotionQueue } from '../jobs/queues.js';
import type { PromoPlatform } from '@findthem/shared';
import { ERROR_CODES } from '@findthem/shared';

const repostBodySchema = z.object({
  platforms: z.array(z.enum(['TWITTER', 'KAKAO_CHANNEL'])).optional(),
  regenerateContent: z.boolean().optional().default(true),
});

export function registerPromotionRoutes(router: Router) {
  // GET /reports/:id/promotions — 신고의 홍보 이력 조회 (본인 신고만)
  router.get('/reports/:id/promotions', requireAuth, async (req, res) => {
    const reportId = req.params['id'] as string;
    const userId = req.user!.userId;

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
      const userId = req.user!.userId;
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

      // 기존 POSTED Promotion → DELETED 처리
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
            platforms: (targetPlatforms ?? 'all') as unknown as string,
            regenerateContent,
          },
        },
      });

      res.json({ ok: true, version: nextVersion });
    },
  );
}
