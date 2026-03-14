import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';
import { analyzeImage } from '../ai/matchingAgent.js';
import {
  createWorker,
  promotionQueue,
  matchingQueue,
  type ImageJobData,
} from './queues.js';
import { createLogger } from '../logger.js';

const log = createLogger('imageProcessingJob');

async function processImageJob(job: Job<ImageJobData>) {
  const { type, reportId, sightingId } = job.data;

  if (type === 'report' && reportId) {
    await processReportPhotos(reportId);
  } else if (type === 'sighting' && sightingId) {
    await processSightingPhotos(sightingId);
  } else {
    throw new Error(`잘못된 job 데이터: type=${type}, reportId=${reportId}, sightingId=${sightingId}`);
  }
}

async function processReportPhotos(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { photos: true },
  });
  if (!report) return;
  if (report.photos.length === 0) {
    log.warn({ reportId }, 'Report has no photos, skipping');
    return;
  }

  // 각 사진에 대해 AI 분석
  for (const photo of report.photos) {
    if (photo.aiAnalysis) continue; // 이미 분석됨

    try {
      const base64 = await imageService.toBase64(photo.photoUrl);
      const analysis = await analyzeImage(base64, report.subjectType);

      await prisma.reportPhoto.update({
        where: { id: photo.id },
        data: { aiAnalysis: analysis as object },
      });
    } catch (err) {
      log.error({ err, photoId: photo.id }, 'Photo analysis failed');
    }
  }

  // 대표 사진의 분석 결과를 report.aiDescription에 저장
  const primaryPhoto = report.photos.find((p) => p.isPrimary) || report.photos[0];
  if (primaryPhoto) {
    const updated = await prisma.reportPhoto.findUnique({
      where: { id: primaryPhoto.id },
    });
    if (updated?.aiAnalysis) {
      const analysis = updated.aiAnalysis as Record<string, unknown>;
      await prisma.report.update({
        where: { id: reportId },
        data: {
          aiDescription: (analysis.description as string) || JSON.stringify(analysis),
        },
      });
    }
  }

  // 홍보 작업 enqueue
  await promotionQueue.add('generate-and-post', { reportId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  });

  // 기존 제보들과 매칭
  await matchingQueue.add('match-report', { type: 'report', reportId }, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
  });
}

async function processSightingPhotos(sightingId: string) {
  const sighting = await prisma.sighting.findUnique({
    where: { id: sightingId },
    include: { photos: true },
  });
  if (!sighting) return;
  if (sighting.photos.length === 0) {
    log.warn({ sightingId }, 'Sighting has no photos, skipping');
    return;
  }

  // 제보와 연결된 report의 subjectType 확인 (없으면 일반 동물/사람 분석)
  let subjectType = 'PERSON'; // reportId 없는 일반 제보의 기본값
  if (sighting.reportId) {
    const report = await prisma.report.findUnique({
      where: { id: sighting.reportId },
    });
    if (report) subjectType = report.subjectType;
  }

  for (const photo of sighting.photos) {
    if (photo.aiAnalysis) continue;

    try {
      const base64 = await imageService.toBase64(photo.photoUrl);
      const analysis = await analyzeImage(base64, subjectType);

      await prisma.sightingPhoto.update({
        where: { id: photo.id },
        data: { aiAnalysis: analysis as object },
      });
    } catch (err) {
      log.error({ err, photoId: photo.id }, 'Sighting photo analysis failed');
    }
  }

  // 제보 상태 업데이트
  await prisma.sighting.update({
    where: { id: sightingId },
    data: { status: 'ANALYZED' },
  });

  // 매칭 작업 enqueue
  await matchingQueue.add('match-sighting', { type: 'sighting', sightingId }, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
  });
}

export function startImageWorker() {
  log.info('Image processing worker started');
  createWorker<ImageJobData>('image-processing', processImageJob, {
    concurrency: 2,
  });
}
