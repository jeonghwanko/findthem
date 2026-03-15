import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';
import { generatePromoTexts } from '../ai/promotionAgent.js';
import { generateRepostContent } from '../ai/promotionContentAgent.js';
import { determineStrategy } from '../ai/promotionStrategyAgent.js';
import { postToAllPlatforms } from '../platforms/platformManager.js';
import {
  createWorker,
  promotionMonitorQueue,
  type PromotionJobData,
} from './queues.js';
import type { PromoPlatform, PromotionMetrics } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('promotionJob');

async function processPromotionJob(job: Job<PromotionJobData>) {
  const { reportId, isRepost = false, version = 1, platforms } = job.data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { photos: true },
  });

  if (!report || report.status !== 'ACTIVE') return;

  const primaryPhoto = report.photos.find((p) => p.isPrimary) || report.photos[0];
  if (!primaryPhoto) {
    log.warn({ reportId }, 'No photos on report, skipping');
    return;
  }

  const photoBase64 = await imageService.toBase64(primaryPhoto.photoUrl);

  // 1. 홍보 전략 결정 → PromotionStrategy upsert
  const strategy = await determineStrategy(report, photoBase64);

  await prisma.promotionStrategy.upsert({
    where: { reportId },
    create: {
      reportId,
      urgency: strategy.urgency,
      targetPlatforms: strategy.targetPlatforms,
      repostIntervalH: strategy.repostIntervalH,
      maxReposts: strategy.maxReposts,
      keywords: strategy.keywords,
      hashtags: strategy.hashtags,
      aiReasoning: strategy.reasoning,
    },
    update: {
      urgency: strategy.urgency,
      targetPlatforms: strategy.targetPlatforms,
      repostIntervalH: strategy.repostIntervalH,
      maxReposts: strategy.maxReposts,
      keywords: strategy.keywords,
      hashtags: strategy.hashtags,
      aiReasoning: strategy.reasoning,
    },
  });

  // 2. 홍보 문구 생성
  let promoTexts;

  if (isRepost) {
    // 재게시 — 이전 POSTED/DELETED Promotion 중 가장 최신 content 조회
    const prevPromotion = await prisma.promotion.findFirst({
      where: { reportId, status: { in: ['POSTED', 'DELETED'] } },
      orderBy: { postedAt: 'desc' },
      select: { content: true, metrics: true },
    });

    const previousContent = prevPromotion?.content ?? '';
    const previousMetrics = prevPromotion?.metrics
      ? (prevPromotion.metrics as unknown as PromotionMetrics)
      : null;

    promoTexts = await generateRepostContent(
      report,
      photoBase64,
      previousContent,
      previousMetrics,
      version,
    );
  } else {
    promoTexts = await generatePromoTexts(report, photoBase64);
  }

  // report에 홍보문 저장 (최초 게시 또는 재게시 모두)
  await prisma.report.update({
    where: { id: reportId },
    data: { aiPromoText: promoTexts.general },
  });

  // 3. 게시 대상 플랫폼 결정 (인자 platforms 우선, 없으면 strategy의 targetPlatforms)
  const targetPlatforms: PromoPlatform[] =
    platforms && platforms.length > 0 ? platforms : strategy.targetPlatforms;

  // 재게시 시 기존 POSTED Promotion → DELETED로 변경
  if (isRepost) {
    await prisma.promotion.updateMany({
      where: {
        reportId,
        platform: { in: targetPlatforms },
        status: 'POSTED',
      },
      data: { status: 'DELETED' },
    });
  }

  // 4. 각 플랫폼에 게시
  const imagePaths = report.photos.map((p) => p.photoUrl);

  // targetPlatforms 필터링하여 게시 (platformManager는 모든 플랫폼에 게시하므로 직접 필터)
  const platformTextMap: Record<string, string> = {};
  if (targetPlatforms.includes('TWITTER')) {
    platformTextMap['twitter'] = promoTexts.twitter;
  }
  if (targetPlatforms.includes('KAKAO_CHANNEL')) {
    platformTextMap['kakao_channel'] = promoTexts.kakao;
  }
  platformTextMap['general'] = promoTexts.general;

  const results = await postToAllPlatforms(platformTextMap, imagePaths);

  // targetPlatforms에 포함된 결과만 처리
  const platformNameMap: Record<PromoPlatform, string> = {
    TWITTER: 'twitter',
    KAKAO_CHANNEL: 'kakao_channel',
  };

  for (const tPlatform of targetPlatforms) {
    const adapterName = platformNameMap[tPlatform];
    const result = results.find((r) => r.platform === adapterName);

    if (!result) continue;

    // 재게시: 새 레코드 생성 (@@unique 제약 때문에 기존이 DELETED가 된 후 새로 생성)
    let savedPromotion: { id: string };
    if (isRepost) {
      savedPromotion = await prisma.promotion.create({
        data: {
          reportId,
          platform: tPlatform,
          content: tPlatform === 'TWITTER' ? promoTexts.twitter : promoTexts.kakao,
          imageUrls: imagePaths,
          postId: result.postId,
          postUrl: result.postUrl,
          status: result.success ? 'POSTED' : 'FAILED',
          errorMessage: result.error ?? null,
          postedAt: result.success ? new Date() : null,
          version,
        },
        select: { id: true },
      });
    } else {
      // 최초 게시: upsert (멱등성 보장)
      savedPromotion = await prisma.promotion.upsert({
        where: { reportId_platform: { reportId, platform: tPlatform } },
        create: {
          reportId,
          platform: tPlatform,
          content: tPlatform === 'TWITTER' ? promoTexts.twitter : promoTexts.kakao,
          imageUrls: imagePaths,
          postId: result.postId,
          postUrl: result.postUrl,
          status: result.success ? 'POSTED' : 'FAILED',
          errorMessage: result.error ?? null,
          postedAt: result.success ? new Date() : null,
          version: 1,
        },
        update: {
          content: tPlatform === 'TWITTER' ? promoTexts.twitter : promoTexts.kakao,
          postId: result.postId,
          postUrl: result.postUrl,
          status: result.success ? 'POSTED' : 'FAILED',
          errorMessage: result.error ?? null,
          postedAt: result.success ? new Date() : null,
          version: 1,
        },
        select: { id: true },
      });
    }

    // 게시 성공 시 메트릭 수집 job 등록 (1시간 후) — 반환값 id 직접 사용
    if (result.success && result.postId) {
      await promotionMonitorQueue.add(
        'collect-metrics',
        {
          reportId,
          promotionId: savedPromotion.id,
          platform: tPlatform,
          postId: result.postId,
        },
        {
          delay: 60 * 60 * 1000, // 1시간 후
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    }
  }

  // 5. PromotionLog 기록
  const successCount = results.filter((r) => r.success).length;

  await prisma.promotionLog.create({
    data: {
      reportId,
      action: isRepost ? 'reposted' : 'posted',
      detail: {
        version,
        platforms: targetPlatforms,
        successCount,
        totalCount: targetPlatforms.length,
        urgency: strategy.urgency,
      },
    },
  });

  log.info(
    { reportId, version, isRepost, successCount, totalCount: results.length },
    `Report promotion complete (${isRepost ? 'repost' : 'initial'})`,
  );
}

export function startPromotionWorker() {
  log.info('Promotion worker started');
  createWorker<PromotionJobData>('promotion', processPromotionJob, {
    concurrency: 2,
  });
}
