import type { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { createWorker, promotionQueue, promotionRepostQueue, type PromotionRepostJobData } from './queues.js';
import { QUEUE_NAMES } from '@findthem/shared';
import { createLogger } from '../logger.js';
import { isCronEnabled, getCronIntervalHours } from '../ai/aiSettings.js';

const log = createLogger('promotionRepostJob');

async function processPromotionRepostJob(job: Job<PromotionRepostJobData>) {
  // enabled 체크 — 관리자가 off 설정 시 즉시 skip (수동 트리거는 항상 실행)
  if (job.data.reason !== 'manual') {
    const enabled = await isCronEnabled('promotion-repost');
    if (!enabled) {
      log.info('Promotion repost cron disabled, skipping');
      return;
    }

    // interval 체크 — 마지막 실행으로부터 설정된 시간이 지나지 않았으면 skip
    const intervalH = await getCronIntervalHours('promotion-repost');
    const lastRunRow = await prisma.aiSetting.findUnique({ where: { key: 'cron:promotion-repost:last-run' } });
    if (lastRunRow?.value) {
      const elapsedMs = Date.now() - new Date(lastRunRow.value).getTime();
      if (elapsedMs < intervalH * 3_600_000) {
        log.info({ intervalH, elapsedH: (elapsedMs / 3_600_000).toFixed(1) }, 'Promotion repost interval not reached, skipping');
        return;
      }
    }

    await prisma.aiSetting.upsert({
      where: { key: 'cron:promotion-repost:last-run' },
      create: { key: 'cron:promotion-repost:last-run', value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
  }

  const { reason, platforms, regenerateContent } = job.data;

  log.info({ reason }, 'Repost scan started');

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

  // N+1 제거: 각 reportId별 최신 Promotion을 일괄 조회
  // Prisma의 distinct+orderBy는 PostgreSQL DISTINCT ON 보장이 불명확하므로 raw query 사용
  const reportIds = strategies.map((s) => s.reportId);
  const promotions = await prisma.$queryRaw<
    { reportId: string; postedAt: Date; version: number; platform: string }[]
  >(
    Prisma.sql`
      SELECT DISTINCT ON ("reportId") "reportId", "postedAt", "version", "platform"
      FROM "promotion"
      WHERE "reportId" = ANY(${reportIds}::text[])
        AND "status" IN ('POSTED', 'DELETED')
      ORDER BY "reportId", "postedAt" DESC
    `,
  );
  const promotionMap = new Map(promotions.map((p) => [p.reportId, p]));

  for (const strategy of strategies) {
    const { reportId, repostIntervalH, maxReposts, targetPlatforms } = strategy;
    const report = strategy.report;

    if (report.status !== 'ACTIVE') continue;

    // promotionMap에서 직접 조회 (별도 DB 쿼리 없음)
    const latestPromotion = promotionMap.get(reportId);

    // 게시된 기록이 없으면 스킵 (promotionJob에서 최초 게시 담당)
    if (!latestPromotion?.postedAt) continue;

    const nextRepostAt = new Date(
      latestPromotion.postedAt.getTime() + repostIntervalH * 60 * 60 * 1000,
    );

    if (new Date() < nextRepostAt) continue;

    // 현재 버전(최대 게시 횟수) 확인
    const currentVersion = latestPromotion.version ?? 1;
    if (currentVersion >= maxReposts) {
      log.info({ reportId, maxReposts }, 'Max repost count reached, skipping');
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
      {
        jobId: `repost-${reportId}-v${currentVersion + 1}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
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
      'Repost enqueued',
    );
  }

  log.info({ enqueued }, 'Repost scan complete');
}

// 고정 cron: 매시간 정각 트리거. enabled/interval은 job 실행 시 DB 설정으로 동적 판단
const REPOST_CRON = '0 * * * *';

export function startPromotionRepostWorker() {
  log.info('Promotion repost worker started');
  createWorker<PromotionRepostJobData>(QUEUE_NAMES.PROMOTION_REPOST, processPromotionRepostJob, {
    concurrency: 1,
  });
}

/** 서버 시작 시 리포스트 크론 등록 */
export async function schedulePromotionRepostJob() {
  const existingJobs = await promotionRepostQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === 'scan-reposts') {
      await promotionRepostQueue.removeRepeatableByKey(job.key);
    }
  }

  await promotionRepostQueue.add(
    'scan-reposts',
    { reason: 'scheduled' },
    { attempts: 2, backoff: { type: 'exponential', delay: 60_000 }, repeat: { pattern: REPOST_CRON } },
  );
  log.info({ cron: REPOST_CRON }, 'Promotion repost cron scheduled');
}
