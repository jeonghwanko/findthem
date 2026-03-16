import type { Queue } from 'bullmq';
import { prisma } from '../db/client.js';
import {
  imageQueue,
  promotionQueue,
  matchingQueue,
  notificationQueue,
  cleanupQueue,
  promotionMonitorQueue,
  promotionRepostQueue,
  crawlSchedulerQueue,
  crawlQueue,
} from '../jobs/queues.js';
import { NOTIFY_THRESHOLD } from '@findthem/shared';
import type { QueueStatusSummary, AdminOverviewStats } from '@findthem/shared';

// ── 날짜 헬퍼 ──

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── 큐 상태 ──

async function getQueueStatusSingle(queue: Queue): Promise<QueueStatusSummary> {
  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);
  return { name: queue.name, waiting, active, completed, failed, delayed, paused };
}

export async function getQueueStatuses(): Promise<QueueStatusSummary[]> {
  const queues: Queue[] = [
    crawlSchedulerQueue,
    crawlQueue,
    imageQueue,
    promotionQueue,
    matchingQueue,
    notificationQueue,
    cleanupQueue,
    promotionMonitorQueue,
    promotionRepostQueue,
  ];
  return Promise.all(queues.map(getQueueStatusSingle));
}

// ── 개요 통계 ──

export async function getOverviewStats(): Promise<AdminOverviewStats> {
  const today = todayStart();
  const week = weekStart();

  const [
    reportTotal,
    reportActive,
    reportFound,
    reportSuspended,
    reportToday,
    reportWeek,
    sightingTotal,
    sightingToday,
    sightingWeek,
    sightingBySource,
    matchTotal,
    matchConfirmed,
    matchPending,
    matchAvg,
    matchHigh,
    userTotal,
    userToday,
    userBlocked,
  ] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: 'ACTIVE' } }),
    prisma.report.count({ where: { status: 'FOUND' } }),
    prisma.report.count({ where: { status: 'SUSPENDED' } }),
    prisma.report.count({ where: { createdAt: { gte: today } } }),
    prisma.report.count({ where: { createdAt: { gte: week } } }),
    prisma.sighting.count(),
    prisma.sighting.count({ where: { createdAt: { gte: today } } }),
    prisma.sighting.count({ where: { createdAt: { gte: week } } }),
    prisma.sighting.groupBy({ by: ['source'], _count: true }),
    prisma.match.count(),
    prisma.match.count({ where: { status: 'CONFIRMED' } }),
    prisma.match.count({ where: { status: 'PENDING' } }),
    prisma.match.aggregate({ _avg: { confidence: true } }),
    prisma.match.count({ where: { confidence: { gte: NOTIFY_THRESHOLD } } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { isBlocked: true } }),
  ]);

  const bySource = { WEB: 0, KAKAO_CHATBOT: 0, ADMIN: 0 } as Record<string, number>;
  for (const row of sightingBySource) {
    bySource[row.source] = row._count;
  }

  const queues = await getQueueStatuses();

  return {
    reports: {
      total: reportTotal,
      active: reportActive,
      found: reportFound,
      suspended: reportSuspended,
      todayNew: reportToday,
      weekNew: reportWeek,
    },
    sightings: {
      total: sightingTotal,
      todayNew: sightingToday,
      weekNew: sightingWeek,
      bySource: bySource as AdminOverviewStats['sightings']['bySource'],
    },
    matches: {
      total: matchTotal,
      confirmed: matchConfirmed,
      pending: matchPending,
      avgConfidence: matchAvg._avg.confidence ?? 0,
      highConfidenceCount: matchHigh,
    },
    users: {
      total: userTotal,
      todayNew: userToday,
      blocked: userBlocked,
    },
    queues,
  };
}

// ── 시계열 통계 ──

type TimelineMetric = 'reports' | 'sightings' | 'matches' | 'users';
type TimelinePeriod = 'day' | 'week' | 'month';

export interface TimelineOptions {
  metric: TimelineMetric;
  period: TimelinePeriod;
  from?: string;
  to?: string;
}

interface RawTimelineRow {
  date: Date;
  count: bigint;
}

const TABLE_NAME: Record<TimelineMetric, string> = {
  reports: 'report',
  sightings: 'sighting',
  matches: 'match',
  users: 'user',
};

const TRUNC_UNIT: Record<TimelinePeriod, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

export async function getTimelineStats(options: TimelineOptions) {
  const from = options.from ? new Date(options.from) : new Date(Date.now() - 30 * 86_400_000);
  const to = options.to ? new Date(options.to) : new Date();

  const tableName = TABLE_NAME[options.metric];
  const truncUnit = TRUNC_UNIT[options.period];

  if (!tableName || !truncUnit) {
    throw new Error(`Invalid metric or period: ${options.metric}/${options.period}`);
  }

  const result = await prisma.$queryRawUnsafe<RawTimelineRow[]>(
    `SELECT date_trunc('${truncUnit}', created_at) AS date, COUNT(*)::bigint AS count
     FROM "${tableName}"
     WHERE created_at >= $1 AND created_at <= $2
     GROUP BY date
     ORDER BY date`,
    from,
    to,
  );

  return {
    metric: options.metric,
    period: options.period,
    data: result.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      count: Number(r.count),
    })),
  };
}

// ── 실패 잡 조회 ──

const QUEUE_MAP: Record<string, Queue> = {
  'image-processing': imageQueue,
  promotion: promotionQueue,
  matching: matchingQueue,
  notification: notificationQueue,
  cleanup: cleanupQueue,
  'promotion-monitor': promotionMonitorQueue,
  'promotion-repost': promotionRepostQueue,
};

export async function getFailedJobs(queueName?: string, limit = 20) {
  const queuesToCheck: Queue[] = queueName
    ? [QUEUE_MAP[queueName]].filter((q): q is Queue => q !== undefined)
    : Object.values(QUEUE_MAP);

  const results: {
    queueName: string;
    id: string | undefined;
    name: string;
    data: unknown;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
  }[] = [];

  for (const q of queuesToCheck) {
    const jobs = await q.getFailed(0, limit - 1);
    for (const job of jobs) {
      results.push({
        queueName: q.name,
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      });
    }
  }

  return results
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, limit);
}

// ── 시스템 헬스체크 ──

interface HealthCheckEntry {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export async function getSystemHealth(): Promise<Record<string, HealthCheckEntry>> {
  const checks: Record<string, HealthCheckEntry> = {};

  // DB 응답 확인
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (e) {
    checks.database = {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Redis 응답 확인 (BullMQ 큐 클라이언트를 통해)
  try {
    const start = Date.now();
    const client = await imageQueue.client;
    await client.ping();
    checks.redis = { status: 'ok', latencyMs: Date.now() - start };
  } catch (e) {
    checks.redis = {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return checks;
}
