import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { deleteFromAllPlatforms, postToAllPlatforms } from '../platforms/platformManager.js';
import { generateThankYouMessage } from '../ai/promotionContentAgent.js';
import { createWorker, type CleanupJobData } from './queues.js';
import { QUEUE_NAMES } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('cleanupJob');

async function processCleanupJob(job: Job<CleanupJobData>) {
  const { reportId } = job.data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { photos: { where: { isPrimary: true }, take: 1 } },
  });

  if (!report) {
    log.warn({ reportId }, 'Report not found');
    return;
  }

  // FOUND 상태가 아니면 실행 중단 (잘못 enqueue된 경우 방지)
  if (report.status !== 'FOUND') {
    log.warn({ reportId, status: report.status }, 'Report status is not FOUND, skipping');
    return;
  }

  // RACE-07: POSTED → DELETED 원자적 선점 — 중복 cleanup job 실행 시 SNS API 이중 호출 방지
  // updateMany 단일 호출로 선점 (findMany→updateMany 2단계 분리 시 레이스 위험)
  const { count: claimedCount } = await prisma.promotion.updateMany({
    where: { reportId, status: 'POSTED' },
    data: { status: 'DELETED' },
  });

  if (claimedCount === 0) {
    log.info({ reportId }, 'No SNS posts to delete');
    return;
  }

  // 선점 성공한 것만 조회
  const promotions = await prisma.promotion.findMany({
    where: { reportId, status: 'DELETED' },
    select: { id: true, platform: true, postId: true },
  });

  // SNS 게시물 삭제
  if (promotions.length > 0) {
    const deletionTargets = promotions
      .filter((p): p is typeof p & { postId: string } => p.postId !== null)
      .map((p) => ({
        platform: p.platform.toLowerCase(),
        postId: p.postId,
      }));

    await deleteFromAllPlatforms(deletionTargets);

    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'found_cleanup',
        detail: {
          deletedCount: promotions.length,
          platforms: promotions.map((p) => p.platform),
        },
      },
    });

    log.info(
      { reportId, reportName: report.name, deletedCount: promotions.length },
      'SNS posts deleted',
    );
  }

  // 감사 메시지 게시 (실패해도 전체 작업은 계속 진행)
  try {
    const thankYouTexts = await generateThankYouMessage({
      subjectType: report.subjectType,
      name: report.name,
      features: report.features,
      lastSeenAddress: report.lastSeenAddress,
      lastSeenAt: report.lastSeenAt,
      contactPhone: report.contactPhone,
      contactName: report.contactName,
    });

    const imagePaths: string[] = report.photos.length > 0
      ? [report.photos[0].photoUrl]
      : [];

    const thanksResults = await postToAllPlatforms(
      {
        twitter: thankYouTexts.twitter,
        kakao_channel: thankYouTexts.kakao,
        general: thankYouTexts.general,
      },
      imagePaths,
    );

    const successCount = thanksResults.filter((r) => r.success).length;

    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'thank_you_posted',
        detail: {
          successCount,
          totalCount: thanksResults.length,
          results: thanksResults.map((r) => ({
            platform: r.platform,
            success: r.success,
            postId: r.postId,
          })),
        },
      },
    });

    log.info(
      { reportId, reportName: report.name, successCount, totalCount: thanksResults.length },
      'Thank-you message posted',
    );
  } catch (err) {
    // 감사 메시지 게시 실패는 무시 (cleanup 자체는 성공)
    log.warn({ err, reportId }, 'Failed to post thank-you message (ignored)');

    try {
      await prisma.promotionLog.create({
        data: {
          reportId,
          action: 'thank_you_failed',
          detail: {
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
    } catch {
      // 로그 기록 실패도 무시
    }
  }
}

export function startCleanupWorker() {
  log.info('Cleanup worker started');
  createWorker<CleanupJobData>(QUEUE_NAMES.CLEANUP, processCleanupJob, {
    concurrency: 3,
  });
}
