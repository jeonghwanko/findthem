import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { createWorker, promotionMonitorQueue, promotionQueue, type PromotionMonitorJobData } from './queues.js';
import { TwitterAdapter } from '../platforms/twitter.js';
import { QUEUE_NAMES, type PromotionMetrics, type PlatformAdapter } from '@findthem/shared';
import { analyzePerformance } from '../ai/promotionFeedbackAgent.js';
import { createLogger } from '../logger.js';

const log = createLogger('promotionMonitorJob');

const twitterAdapter: PlatformAdapter = new TwitterAdapter();

/** Collection schedule: round 0 = 1h, round 1 = 24h, round 2 = 72h */
const COLLECTION_DELAYS_MS = [
  1 * 60 * 60 * 1000,   // round 0 → 1h (already scheduled by promotionJob)
  24 * 60 * 60 * 1000,  // round 1 → 24h after posting
  72 * 60 * 60 * 1000,  // round 2 → 72h after posting (final)
];

async function collectMetrics(
  platform: string,
  postId: string,
): Promise<PromotionMetrics | null> {
  try {
    if (platform === 'TWITTER') {
      if (typeof twitterAdapter.getMetrics === 'function') {
        return await twitterAdapter.getMetrics(postId);
      }
      return null;
    }

    if (platform === 'KAKAO_CHANNEL') {
      // Kakao Channel 메트릭 API 미제공
      return null;
    }

    return null;
  } catch (err) {
    log.warn({ err, platform, postId }, 'Failed to collect metrics');
    return null;
  }
}

async function processPromotionMonitorJob(job: Job<PromotionMonitorJobData>) {
  const { reportId, promotionId, platform, postId, round = 0 } = job.data;

  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true, status: true, platform: true, postId: true, content: true, version: true },
  });

  if (!promotion) {
    log.warn({ promotionId }, 'Promotion not found');
    return;
  }

  if (promotion.status !== 'POSTED') {
    log.info({ promotionId, status: promotion.status }, 'Promotion status is not POSTED, skipping');
    return;
  }

  const metrics = await collectMetrics(platform, postId);

  if (metrics) {
    const metricsJson = metrics as unknown as Prisma.InputJsonObject;

    await prisma.promotion.update({
      where: { id: promotionId },
      data: {
        metrics: metricsJson,
        metricsAt: new Date(),
      },
    });

    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'metrics_collected',
        detail: {
          promotionId,
          platform,
          postId,
          round,
          metrics: metricsJson,
        } as Prisma.InputJsonObject,
      },
    });

    log.info({ reportId, platform, round, metrics }, 'Metrics collected');

    // ── 피드백 루프: round 0(1h 후)에서만 성과 분석 + 저성과 재게시 트리거 ──
    if (round === 0 && promotion.content) {
      try {
        const feedback = await analyzePerformance(
          metrics,
          promotion.content,
          platform as 'TWITTER' | 'KAKAO_CHANNEL',
        );

        await prisma.promotionLog.create({
          data: {
            reportId,
            action: 'performance_analyzed',
            detail: {
              promotionId,
              platform,
              shouldRepost: feedback.shouldRepost,
              suggestions: feedback.improvementSuggestions,
            } as unknown as Prisma.InputJsonObject,
          },
        });

        if (feedback.shouldRepost) {
          log.info({ reportId, platform }, 'Low performance detected, triggering repost');
          await promotionQueue.add(
            'repost-report',
            {
              reportId,
              isRepost: true,
              version: (promotion.version ?? 1) + 1,
              reason: 'low_performance',
              regenerateContent: true,
            },
            { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
          );
        }
      } catch (err) {
        log.warn({ err, reportId }, 'Performance analysis failed, continuing');
      }
    }
  } else {
    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'metrics_unavailable',
        detail: {
          promotionId,
          platform,
          postId,
          round,
          reason: 'API not available or not configured',
        },
      },
    });

    log.info({ reportId, platform, round }, 'Metrics unavailable (API not configured)');
  }

  // ── 다음 라운드 수집 예약 ──
  const nextRound = round + 1;
  if (nextRound < COLLECTION_DELAYS_MS.length) {
    const delay = COLLECTION_DELAYS_MS[nextRound] - COLLECTION_DELAYS_MS[round];
    await promotionMonitorQueue.add(
      'collect-metrics',
      { reportId, promotionId, platform, postId, round: nextRound },
      { delay, attempts: 2, backoff: { type: 'exponential', delay: 30_000 } },
    );
    log.info({ reportId, platform, nextRound, delayH: delay / 3600_000 }, 'Next metrics collection scheduled');
  }
}

export function startPromotionMonitorWorker() {
  log.info('Promotion monitor worker started');
  createWorker<PromotionMonitorJobData>(QUEUE_NAMES.PROMOTION_MONITOR, processPromotionMonitorJob, {
    concurrency: 3,
  });
}
