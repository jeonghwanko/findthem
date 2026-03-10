import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { deleteFromAllPlatforms } from '../platforms/platformManager.js';
import { createWorker, type CleanupJobData } from './queues.js';

async function processCleanupJob(job: Job<CleanupJobData>) {
  const { reportId } = job.data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, name: true, status: true },
  });

  if (!report) {
    console.warn(`[CLEANUP] Report ${reportId}를 찾을 수 없음`);
    return;
  }

  // FOUND 상태가 아니면 실행 중단 (잘못 enqueue된 경우 방지)
  if (report.status !== 'FOUND') {
    console.warn(`[CLEANUP] Report ${reportId} 상태가 FOUND가 아님 (${report.status}), 건너뜀`);
    return;
  }

  // POSTED 상태인 게시물 조회
  const promotions = await prisma.promotion.findMany({
    where: { reportId, status: 'POSTED' },
    select: { id: true, platform: true, postId: true },
  });

  if (promotions.length === 0) {
    console.log(`[CLEANUP] Report ${reportId} 삭제할 SNS 게시물 없음`);
    return;
  }

  // SNS 게시물 삭제
  const deletionTargets = promotions
    .filter((p) => p.postId !== null)
    .map((p) => ({
      platform: p.platform.toLowerCase(),
      postId: p.postId!,
    }));

  await deleteFromAllPlatforms(deletionTargets);

  // DB 상태 일괄 업데이트
  await prisma.promotion.updateMany({
    where: { id: { in: promotions.map((p) => p.id) } },
    data: { status: 'DELETED' },
  });

  console.log(
    `[CLEANUP] Report "${report.name}" (${reportId}) — SNS 게시물 ${promotions.length}건 삭제 완료`,
  );
}

export function startCleanupWorker() {
  console.log('Cleanup worker started');
  createWorker<CleanupJobData>('cleanup', processCleanupJob, {
    concurrency: 3,
  });
}
