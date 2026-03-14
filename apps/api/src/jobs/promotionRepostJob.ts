import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { createWorker, promotionQueue, type PromotionRepostJobData } from './queues.js';
import { createLogger } from '../logger.js';

const log = createLogger('promotionRepostJob');

async function processPromotionRepostJob(job: Job<PromotionRepostJobData>) {
  const { reason, platforms, regenerateContent } = job.data;

  log.info({ reason }, '재홍보 스캔 시작');

  // ACTIVE 신고 중 PromotionStrategy가 있는 것만 조회
  const strategies = await prisma.promotionStrategy.findMany({
    where: {
      report: { status: 'ACTIVE' },
    },
    include: {
      report: {
        select: { id: true, status: true },
      },
    },
  });

  let enqueued = 0;

  for (const strategy of strategies) {
    const { reportId, repostIntervalH, maxReposts, targetPlatforms } = strategy;
    const report = strategy.report;

    if (report.status !== 'ACTIVE') continue;

    // 해당 신고의 POSTED Promotion 중 가장 최근 게시 시각 조회
    const latestPromotion = await prisma.promotion.findFirst({
      where: {
        reportId,
        status: { in: ['POSTED', 'DELETED'] },
      },
      orderBy: { postedAt: 'desc' },
      select: { postedAt: true, version: true },
    });

    // 게시된 기록이 없으면 스킵 (promotionJob에서 최초 게시 담당)
    if (!latestPromotion?.postedAt) continue;

    const nextRepostAt = new Date(
      latestPromotion.postedAt.getTime() + repostIntervalH * 60 * 60 * 1000,
    );

    if (new Date() < nextRepostAt) continue;

    // 현재 버전(최대 게시 횟수) 확인
    const currentVersion = latestPromotion.version ?? 1;
    if (currentVersion >= maxReposts) {
      log.info({ reportId, maxReposts }, '최대 재게시 횟수 도달, 스킵');
      continue;
    }

    // platforms 인자가 있으면 교집합 사용, 없으면 strategy의 targetPlatforms 전체 사용
    const resolvedPlatforms =
      platforms && platforms.length > 0
        ? targetPlatforms.filter((p) => platforms.includes(p))
        : targetPlatforms;

    if (resolvedPlatforms.length === 0) continue;

    await promotionQueue.add(
      'repost-report',
      {
        reportId,
        isRepost: true,
        version: currentVersion + 1,
        platforms: resolvedPlatforms,
        regenerateContent,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );

    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'repost_enqueued',
        detail: {
          reason,
          version: currentVersion + 1,
          platforms: resolvedPlatforms,
          regenerateContent,
        },
      },
    });

    enqueued++;
    log.info(
      { reportId, version: currentVersion + 1, platforms: resolvedPlatforms },
      '재홍보 큐 등록',
    );
  }

  log.info({ enqueued }, '재홍보 스캔 완료');
}

export function startPromotionRepostWorker() {
  log.info('Promotion repost worker started');
  createWorker<PromotionRepostJobData>('promotion-repost', processPromotionRepostJob, {
    concurrency: 1,
  });
}
