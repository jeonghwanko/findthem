import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';
import { generatePromoTexts } from '../ai/promotionAgent.js';
import { postToAllPlatforms } from '../platforms/platformManager.js';
import { createWorker, type PromotionJobData } from './queues.js';

async function processPromotionJob(job: Job<PromotionJobData>) {
  const { reportId } = job.data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { photos: true },
  });

  if (!report || report.status !== 'ACTIVE') return;

  const primaryPhoto = report.photos.find((p) => p.isPrimary) || report.photos[0];
  if (!primaryPhoto) {
    console.warn(`Report ${reportId} has no photos, skipping promotion`);
    return;
  }

  // 1. Claude로 홍보문 생성
  const photoBase64 = await imageService.toBase64(primaryPhoto.photoUrl);
  const promoTexts = await generatePromoTexts(report, photoBase64);

  // report에 홍보문 저장
  await prisma.report.update({
    where: { id: reportId },
    data: { aiPromoText: promoTexts.general },
  });

  // 2. 각 플랫폼에 게시
  const imagePaths = report.photos.map((p) => p.photoUrl);
  const results = await postToAllPlatforms(
    {
      twitter: promoTexts.twitter,
      kakao_channel: promoTexts.kakao,
      general: promoTexts.general,
    },
    imagePaths,
  );

  // 3. Promotion 레코드 저장
  for (const result of results) {
    const platform =
      result.platform === 'twitter' ? 'TWITTER' : 'KAKAO_CHANNEL';

    await prisma.promotion.upsert({
      where: {
        reportId_platform: {
          reportId,
          platform: platform as 'TWITTER' | 'KAKAO_CHANNEL',
        },
      },
      create: {
        reportId,
        platform: platform as 'TWITTER' | 'KAKAO_CHANNEL',
        content:
          result.platform === 'twitter'
            ? promoTexts.twitter
            : promoTexts.kakao,
        imageUrls: imagePaths,
        postId: result.postId,
        postUrl: result.postUrl,
        status: result.success ? 'POSTED' : 'FAILED',
        errorMessage: result.error || null,
        postedAt: result.success ? new Date() : null,
      },
      update: {
        content:
          result.platform === 'twitter'
            ? promoTexts.twitter
            : promoTexts.kakao,
        postId: result.postId,
        postUrl: result.postUrl,
        status: result.success ? 'POSTED' : 'FAILED',
        errorMessage: result.error || null,
        postedAt: result.success ? new Date() : null,
      },
    });
  }

  console.log(
    `Promotion for report ${reportId}: ${results.filter((r) => r.success).length}/${results.length} platforms succeeded`,
  );
}

export function startPromotionWorker() {
  console.log('Promotion worker started');
  createWorker<PromotionJobData>('promotion', processPromotionJob, {
    concurrency: 2,
  });
}
