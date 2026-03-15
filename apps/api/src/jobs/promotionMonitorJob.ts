import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { createWorker, type PromotionMonitorJobData } from './queues.js';
import { TwitterAdapter } from '../platforms/twitter.js';
import type { PromotionMetrics, PlatformAdapter } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('promotionMonitorJob');

// Twitter 어댑터 인스턴스 (PlatformAdapter 인터페이스로 캐스팅하여 getMetrics 접근)
const twitterAdapter: PlatformAdapter = new TwitterAdapter();

async function collectMetrics(
  platform: string,
  postId: string,
): Promise<PromotionMetrics | null> {
  try {
    if (platform === 'TWITTER') {
      // PlatformAdapter 인터페이스에 getMetrics?가 정의되어 있음
      if (typeof twitterAdapter.getMetrics === 'function') {
        return await twitterAdapter.getMetrics(postId);
      }

      // TODO: Twitter API v2 Public Metrics 직접 조회
      // GET https://api.twitter.com/2/tweets/:id?tweet.fields=public_metrics
      // Bearer Token 필요: apps/api/src/config.ts에 twitterBearerToken 추가 후 구현
      return null;
    }

    if (platform === 'KAKAO_CHANNEL') {
      // TODO: 카카오 채널 메트릭 수집 API 구현
      // 카카오 비즈니스 API를 통한 메시지 발송 통계 조회
      return null;
    }

    return null;
  } catch (err) {
    log.warn({ err, platform, postId }, 'Failed to collect metrics');
    return null;
  }
}

async function processPromotionMonitorJob(job: Job<PromotionMonitorJobData>) {
  const { reportId, promotionId, platform, postId } = job.data;

  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true, status: true, platform: true, postId: true },
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
          metrics: metricsJson,
        } as Prisma.InputJsonObject,
      },
    });

    log.info({ reportId, platform, metrics }, 'Metrics collected');
  } else {
    // 메트릭 수집 불가 — 로그만 기록
    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'metrics_unavailable',
        detail: {
          promotionId,
          platform,
          postId,
          reason: 'API not available or not configured',
        },
      },
    });

    log.info({ reportId, platform }, 'Metrics unavailable (API not configured)');
  }
}

export function startPromotionMonitorWorker() {
  log.info('Promotion monitor worker started');
  createWorker<PromotionMonitorJobData>('promotion-monitor', processPromotionMonitorJob, {
    concurrency: 3,
  });
}
