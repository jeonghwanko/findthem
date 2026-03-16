import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';
import { matchImages } from '../ai/matchingAgent.js';
import {
  createWorker,
  notificationQueue,
  type MatchingJobData,
} from './queues.js';
import {
  MATCH_THRESHOLD,
  NOTIFY_THRESHOLD,
  MAX_CANDIDATES,
} from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('matchingJob');

async function processMatchingJob(job: Job<MatchingJobData>) {
  const { type, sightingId, reportId } = job.data;

  if (type === 'sighting' && sightingId) {
    await matchSightingAgainstReports(sightingId);
  } else if (type === 'report' && reportId) {
    await matchReportAgainstSightings(reportId);
  }
}

/** 새 제보 → 활성 실종건과 비교 */
async function matchSightingAgainstReports(sightingId: string) {
  const sighting = await prisma.sighting.findUnique({
    where: { id: sightingId },
    include: { photos: true },
  });
  if (!sighting || sighting.photos.length === 0) return;

  // 특정 report에 대한 제보인 경우 해당 report만 비교
  if (sighting.reportId) {
    const report = await prisma.report.findUnique({
      where: { id: sighting.reportId },
      include: { photos: { where: { isPrimary: true }, take: 1 } },
    });
    if (report && report.photos.length > 0) {
      await comparePairDirect(report, sighting);
    }
    return;
  }

  // 활성 실종건 후보 검색
  const candidates = await prisma.report.findMany({
    where: {
      status: 'ACTIVE',
      // 시간 필터: 제보 시간이 실종 시점 이후
      lastSeenAt: { lte: sighting.sightedAt },
    },
    include: {
      photos: { where: { isPrimary: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_CANDIDATES,
  });

  // 이미 매칭된 건 일괄 조회
  const existingMatches = await prisma.match.findMany({
    where: { sightingId, reportId: { in: candidates.map((c) => c.id) } },
    select: { reportId: true },
  });
  const matchedReportIds = new Set(existingMatches.map((m) => m.reportId));

  for (const candidate of candidates) {
    if (candidate.photos.length === 0) continue;
    if (matchedReportIds.has(candidate.id)) continue;

    await comparePairDirect(candidate, sighting);
  }
}

/** 새 실종 등록 → 기존 제보와 비교 */
async function matchReportAgainstSightings(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { photos: { where: { isPrimary: true }, take: 1 } },
  });
  if (!report || report.photos.length === 0) return;

  const sightings = await prisma.sighting.findMany({
    where: {
      status: { in: ['ANALYZED', 'PENDING'] },
      sightedAt: { gte: report.lastSeenAt },
    },
    include: { photos: { take: 1 } },
    orderBy: { createdAt: 'desc' },
    take: MAX_CANDIDATES,
  });

  // 이미 매칭된 건 일괄 조회
  const existingMatches = await prisma.match.findMany({
    where: { reportId, sightingId: { in: sightings.map((s) => s.id) } },
    select: { sightingId: true },
  });
  const matchedSightingIds = new Set(existingMatches.map((m) => m.sightingId));

  for (const sighting of sightings) {
    if (sighting.photos.length === 0) continue;
    if (matchedSightingIds.has(sighting.id)) continue;

    await comparePairDirect(report, sighting);
  }
}

/** 한 쌍 비교 (이미 로드된 데이터 사용 → N+1 방지) */
async function comparePairDirect(
  report: { id: string; subjectType: string; features: string; aiDescription: string | null; photos: { photoUrl: string; aiAnalysis: unknown }[] },
  sighting: { id: string; description: string; photos: { photoUrl: string; aiAnalysis: unknown }[] },
) {
  if (report.photos.length === 0 || sighting.photos.length === 0) return;

  try {
    const reportBase64 = await imageService.toBase64(report.photos[0].photoUrl);
    const sightingBase64 = await imageService.toBase64(sighting.photos[0].photoUrl);

    const result = await matchImages(
      reportBase64,
      sightingBase64,
      {
        subjectType: report.subjectType,
        features: report.features,
        aiDescription: report.aiDescription,
      },
      {
        description: sighting.description,
        aiAnalysis: sighting.photos[0].aiAnalysis as Record<string, unknown> | null,
      },
    );

    if (result.confidence >= MATCH_THRESHOLD) {
      // upsert으로 동시 실행 race condition 방지 (unique constraint: reportId+sightingId)
      const match = await prisma.match.upsert({
        where: { reportId_sightingId: { reportId: report.id, sightingId: sighting.id } },
        create: {
          reportId: report.id,
          sightingId: sighting.id,
          confidence: result.confidence,
          aiReasoning: result.reasoning,
          status: 'PENDING',
        },
        update: {
          confidence: result.confidence,
          aiReasoning: result.reasoning,
        },
      });

      log.info(
        { reportId: report.id, sightingId: sighting.id, confidence: result.confidence },
        'Match found',
      );

      if (result.confidence >= NOTIFY_THRESHOLD) {
        await notificationQueue.add(
          'notify-reporter',
          { matchId: match.id, reportId: report.id },
          { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
        );
      }
    }
  } catch (err) {
    log.error({ err, reportId: report.id, sightingId: sighting.id }, 'Matching failed');
  }
}

export function startMatchingWorker() {
  log.info('Matching worker started');
  createWorker<MatchingJobData>('matching', processMatchingJob, {
    concurrency: 2,
  });
}
