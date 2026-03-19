import { type Job, UnrecoverableError } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';
import { analyzeImage } from '../ai/matchingAgent.js';
import {
  createWorker,
  promotionQueue,
  matchingQueue,
  type ImageJobData,
} from './queues.js';
import { QUEUE_NAMES } from '@findthem/shared';
import type { SubjectType } from '@findthem/shared';
import { createLogger } from '../logger.js';
import { postAliSighting } from '../services/communityAgentService.js';

const log = createLogger('imageProcessingJob');

async function processImageJob(job: Job<ImageJobData>) {
  const { type, reportId, sightingId } = job.data;

  if (type === 'report' && reportId) {
    await processReportPhotos(reportId);
  } else if (type === 'sighting' && sightingId) {
    await processSightingPhotos(sightingId);
  } else {
    throw new UnrecoverableError(`Invalid job data: type=${type}, reportId=${reportId}, sightingId=${sightingId}`);
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

  // 각 사진에 대해 AI 분석 — 병렬 처리
  const updatedPhotos = await Promise.all(
    report.photos.map(async (photo) => {
      if (photo.aiAnalysis) return photo; // 이미 분석됨

      try {
        const base64 = await imageService.toBase64(photo.photoUrl);
        const analysis = await analyzeImage(base64, report.subjectType);

        return await prisma.reportPhoto.update({
          where: { id: photo.id },
          data: { aiAnalysis: analysis as object },
        });
      } catch (err) {
        log.error({ err, photoId: photo.id }, 'Photo analysis failed');
        return photo;
      }
    }),
  );

  // 대표 사진의 분석 결과를 report.aiDescription에 저장 (재조회 없이 반환값 직접 사용)
  const primaryPhoto = updatedPhotos.find((p) => p.isPrimary) || updatedPhotos[0];
  if (primaryPhoto?.aiAnalysis) {
    const analysis = primaryPhoto.aiAnalysis as Record<string, unknown>;
    await prisma.report.update({
      where: { id: reportId },
      data: {
        aiDescription: (analysis.description as string) || JSON.stringify(analysis),
      },
    });
  }

  // 홍보 작업 enqueue — 크롤 수집 데이터는 자동 홍보 제외 (관리자 검토 후 수동 트리거)
  if (!report.externalSource) {
    await promotionQueue.add('generate-and-post', { reportId }, {
      jobId: `promote-${reportId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    });
  }

  // 기존 제보들과 매칭
  await matchingQueue.add('match-report', { type: 'report', reportId }, {
    jobId: `match-report-${reportId}`,
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
  });
}

async function processSightingPhotos(sightingId: string) {
  const sighting = await prisma.sighting.findUnique({
    where: { id: sightingId },
    include: {
      photos: true,
      report: { select: { subjectType: true } },
    },
  });
  if (!sighting) return;
  if (sighting.photos.length === 0) {
    log.warn({ sightingId }, 'Sighting has no photos, skipping');
    return;
  }

  // 제보와 연결된 report의 subjectType 확인 (없으면 동물 기본) — 별도 조회 제거
  const subjectType = sighting.report?.subjectType ?? 'DOG';

  // 각 사진에 대해 AI 분석 — 병렬 처리
  await Promise.all(
    sighting.photos.map(async (photo) => {
      if (photo.aiAnalysis) return;

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
    }),
  );

  // 제보 상태 업데이트
  await prisma.sighting.update({
    where: { id: sightingId },
    data: { status: 'ANALYZED' },
  });

  // AI 분석 결과 요약 → 커뮤니티 게시 (안내봇 알리)
  const analyzedPhotos = await prisma.sightingPhoto.findMany({
    where: { sightingId, aiAnalysis: { not: Prisma.DbNull } },
    select: { aiAnalysis: true },
    take: 1,
  });
  if (analyzedPhotos.length > 0) {
    const analysis = analyzedPhotos[0].aiAnalysis as Record<string, unknown>;
    const parts: string[] = [];
    if (analysis.species) parts.push(`품종: ${analysis.species}`);
    if (analysis.color) parts.push(`색상: ${analysis.color}`);
    if (analysis.size) parts.push(`크기: ${analysis.size}`);
    if (analysis.description) parts.push(String(analysis.description));
    const summary = parts.join(', ') || '분석 완료';

    void postAliSighting(
      sighting.address,
      (sighting.subjectType ?? sighting.report?.subjectType ?? 'DOG') as SubjectType,
      summary,
      sightingId,
    ).catch((err) => log.warn({ err, sightingId }, 'Ali sighting post failed'));
  }

  // 매칭 작업 enqueue
  await matchingQueue.add('match-sighting', { type: 'sighting', sightingId }, {
    jobId: `match-sighting-${sightingId}`,
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
  });
}

export function startImageWorker() {
  log.info('Image processing worker started');
  createWorker<ImageJobData>(QUEUE_NAMES.IMAGE_PROCESSING, processImageJob, {
    concurrency: 2,
  });
}
