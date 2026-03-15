import type { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  crawlSchedulerQueue,
  crawlQueue,
  promotionQueue,
  promotionMonitorQueue,
  promotionRepostQueue,
  imageQueue,
  matchingQueue,
  notificationQueue,
  cleanupQueue,
} from '../jobs/queues.js';
import { fetchers } from '../jobs/crawl/fetcherRegistry.js';
import { requireAdmin } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { adminLimiter } from '../middlewares/rateLimit.js';
import {
  getOverviewStats,
  getTimelineStats,
  getQueueStatuses,
  getSystemHealth,
  getFailedJobs,
} from '../services/adminStatsService.js';
import { createAuditLog, listAuditLogs } from '../services/auditLogService.js';
import { adminAgentService } from '../services/adminAgent/index.js';
import type { AdminActionSource } from '@findthem/shared';

export function registerAdminRoutes(router: Router) {
  // ── 통계 API ──

  // GET /admin/stats/overview
  router.get('/admin/stats/overview', requireAdmin, async (_req, res) => {
    const stats = await getOverviewStats();
    res.json(stats);
  });

  // GET /admin/stats/timeline
  router.get('/admin/stats/timeline', requireAdmin, async (req, res) => {
    const { metric, period, from, to } = req.query as {
      metric?: string;
      period?: string;
      from?: string;
      to?: string;
    };

    const validMetrics = ['reports', 'sightings', 'matches', 'users'] as const;
    const validPeriods = ['day', 'week', 'month'] as const;

    type TimelineMetric = (typeof validMetrics)[number];
    type TimelinePeriod = (typeof validPeriods)[number];

    if (!metric || !(validMetrics as readonly string[]).includes(metric)) {
      throw new ApiError(400, 'metric은 reports|sightings|matches|users 중 하나여야 합니다.');
    }
    if (!period || !(validPeriods as readonly string[]).includes(period)) {
      throw new ApiError(400, 'period는 day|week|month 중 하나여야 합니다.');
    }

    const data = await getTimelineStats({
      metric: metric as TimelineMetric,
      period: period as TimelinePeriod,
      from,
      to,
    });
    res.json(data);
  });

  // GET /admin/stats/queues
  router.get('/admin/stats/queues', requireAdmin, async (_req, res) => {
    const queues = await getQueueStatuses();
    res.json(queues);
  });

  // GET /admin/stats/failed-jobs
  router.get('/admin/stats/failed-jobs', requireAdmin, async (req, res) => {
    const { queueName, limit } = req.query as { queueName?: string; limit?: string };
    const jobs = await getFailedJobs(queueName, limit ? Number(limit) : 20);
    res.json(jobs);
  });

  // DELETE /admin/stats/failed-jobs — 특정 큐(또는 전체)의 실패 잡 일괄 제거
  router.delete('/admin/stats/failed-jobs', requireAdmin, async (req, res) => {
    const { queueName } = req.query as { queueName?: string };

    const QUEUE_MAP = {
      'image-processing': imageQueue,
      matching: matchingQueue,
      notification: notificationQueue,
      promotion: promotionQueue,
      'promotion-monitor': promotionMonitorQueue,
      'promotion-repost': promotionRepostQueue,
      cleanup: cleanupQueue,
      crawl: crawlQueue,
    } as const;

    type QueueName = keyof typeof QUEUE_MAP;
    const validNames = Object.keys(QUEUE_MAP) as QueueName[];

    if (queueName && !validNames.includes(queueName as QueueName)) {
      throw new ApiError(400, 'INVALID_QUEUE_NAME');
    }

    const targets: QueueName[] = queueName ? [queueName as QueueName] : validNames;
    const results: Record<string, number> = {};

    for (const name of targets) {
      const removed = await QUEUE_MAP[name].clean(5_000, 10_000, 'failed');
      results[name] = removed.length;
    }

    await createAuditLog({
      action: 'clean_failed_jobs',
      targetType: 'queue',
      targetId: queueName ?? 'all',
      detail: results,
      source: 'DASHBOARD',
    });

    res.json({ removed: results });
  });

  // GET /admin/health
  router.get('/admin/health', requireAdmin, async (_req, res) => {
    const health = await getSystemHealth();
    res.json(health);
  });

  // ── 신고 관리 API ──

  // GET /admin/reports
  router.get('/admin/reports', requireAdmin, async (req, res) => {
    const {
      status,
      subjectType,
      q,
      page: pageStr,
      limit: limitStr,
    } = req.query as {
      status?: string;
      subjectType?: string;
      q?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitStr) || 20));

    const where: Prisma.ReportWhereInput = {};
    if (status) where.status = status as Prisma.ReportWhereInput['status'];
    if (subjectType) where.subjectType = subjectType as Prisma.ReportWhereInput['subjectType'];
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { features: { contains: q, mode: 'insensitive' } },
        { lastSeenAddress: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          photos: { where: { isPrimary: true }, take: 1 },
          user: { select: { id: true, name: true, phone: true } },
          _count: { select: { sightings: true, matches: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ items: reports, total, page, totalPages: Math.ceil(total / limit) });
  });

  // PATCH /admin/reports/:id/status
  router.patch('/admin/reports/:id/status', requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const { status, reason } = req.body as { status?: unknown; reason?: unknown };

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      throw new ApiError(400, 'status는 ACTIVE 또는 SUSPENDED여야 합니다.');
    }

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');

    const updated = await prisma.report.update({
      where: { id },
      data: { status },
    });

    await createAuditLog({
      action: `report.status.${status.toLowerCase()}`,
      targetType: 'Report',
      targetId: id,
      detail: { reason: reason ?? null, previousStatus: report.status, newStatus: status },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json(updated);
  });

  // ── 매칭 관리 API ──

  // GET /admin/matches
  router.get('/admin/matches', requireAdmin, async (req, res) => {
    const {
      status,
      minConfidence,
      page: pageStr,
      limit: limitStr,
    } = req.query as {
      status?: string;
      minConfidence?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitStr) || 20));

    const where: Prisma.MatchWhereInput = {};
    if (status) where.status = status as Prisma.MatchWhereInput['status'];
    if (minConfidence !== undefined) {
      where.confidence = { gte: Number(minConfidence) };
    }

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        include: {
          report: {
            include: { photos: { where: { isPrimary: true }, take: 1 } },
          },
          sighting: {
            include: { photos: { take: 1 } },
          },
        },
        orderBy: { confidence: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.match.count({ where }),
    ]);

    res.json({ items: matches, total, page, totalPages: Math.ceil(total / limit) });
  });

  // PATCH /admin/matches/:id/status
  router.patch('/admin/matches/:id/status', requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const { status, reason } = req.body as { status?: unknown; reason?: unknown };

    if (status !== 'CONFIRMED' && status !== 'REJECTED') {
      throw new ApiError(400, 'status는 CONFIRMED 또는 REJECTED여야 합니다.');
    }

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) throw new ApiError(404, 'MATCH_NOT_FOUND');

    const updated = await prisma.match.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });

    await createAuditLog({
      action: `match.status.${status.toLowerCase()}`,
      targetType: 'Match',
      targetId: id,
      detail: { reason: reason ?? null, previousStatus: match.status, newStatus: status },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json(updated);
  });

  // ── 사용자 관리 API ──

  // GET /admin/users
  router.get('/admin/users', requireAdmin, async (req, res) => {
    const {
      q,
      isBlocked,
      page: pageStr,
      limit: limitStr,
    } = req.query as {
      q?: string;
      isBlocked?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitStr) || 20));

    const where: Prisma.UserWhereInput = {};
    if (isBlocked !== undefined) where.isBlocked = isBlocked === 'true';
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          provider: true,
          isBlocked: true,
          blockedAt: true,
          blockReason: true,
          createdAt: true,
          _count: { select: { reports: true, sightings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ items: users, total, page, totalPages: Math.ceil(total / limit) });
  });

  // PATCH /admin/users/:id/block
  router.patch('/admin/users/:id/block', requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const { blocked, reason } = req.body as { blocked?: unknown; reason?: unknown };

    if (typeof blocked !== 'boolean') {
      throw new ApiError(400, 'blocked는 boolean이어야 합니다.');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');

    const updated = await prisma.user.update({
      where: { id },
      data: {
        isBlocked: blocked,
        blockedAt: blocked ? new Date() : null,
        blockReason: blocked ? (typeof reason === 'string' ? reason : null) : null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        isBlocked: true,
        blockedAt: true,
        blockReason: true,
      },
    });

    await createAuditLog({
      action: blocked ? 'user.block' : 'user.unblock',
      targetType: 'User',
      targetId: id,
      detail: { reason: reason ?? null, blocked },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json(updated);
  });

  // ── 감사 로그 API ──

  // GET /admin/audit-logs
  router.get('/admin/audit-logs', requireAdmin, async (req, res) => {
    const { page, limit, targetType, source, from, to } = req.query as {
      page?: string;
      limit?: string;
      targetType?: string;
      source?: string;
      from?: string;
      to?: string;
    };

    const validSources = ['DASHBOARD', 'AGENT', 'API'];
    const resolvedSource =
      source && validSources.includes(source)
        ? (source as AdminActionSource)
        : undefined;

    const result = await listAuditLogs({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      targetType,
      source: resolvedSource,
      from,
      to,
    });

    res.json(result);
  });

  // ── 에이전트 대화 API ──

  // POST /admin/agent/chat
  router.post('/admin/agent/chat', requireAdmin, adminLimiter, async (req, res) => {
    const { sessionId, message } = req.body as {
      sessionId?: unknown;
      message?: unknown;
    };

    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new ApiError(400, 'message는 비어있지 않은 문자열이어야 합니다.');
    }

    const sid = typeof sessionId === 'string' ? sessionId : undefined;
    const result = await adminAgentService.chat(sid, message.trim());
    res.json(result);
  });

  // GET /admin/agent/sessions  (정적 라우트 → 동적 라우트 :id 보다 먼저 등록)
  router.get('/admin/agent/sessions', requireAdmin, async (_req, res) => {
    const sessions = await prisma.adminAgentSession.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(sessions);
  });

  // GET /admin/agent/sessions/:id
  router.get('/admin/agent/sessions/:id', requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    const session = await prisma.adminAgentSession.findUnique({ where: { id } });
    if (!session) throw new ApiError(404, 'AGENT_SESSION_NOT_FOUND');
    res.json(session);
  });

  // ── 크롤 API ──

  // GET /admin/crawl/sources — 등록된 소스 목록
  router.get('/admin/crawl/sources', requireAdmin, (_req, res) => {
    res.json({ sources: fetchers.map((f) => f.source) });
  });

  // POST /admin/crawl/trigger — 즉시 크롤 실행
  router.post('/admin/crawl/trigger', requireAdmin, async (req, res) => {
    const { sources } = req.body as { sources?: string[] };
    const job = await crawlSchedulerQueue.add(
      'crawl-dispatch',
      { sources },
      { jobId: `manual-crawl-${Date.now()}` },
    );
    res.json({ jobId: job.id, sources: sources ?? fetchers.map((f) => f.source) });
  });

  // GET /admin/crawl/stats — 크롤 결과 통계 (최근 수집 현황)
  router.get('/admin/crawl/stats', requireAdmin, async (_req, res) => {
    const [total, bySource] = await Promise.all([
      prisma.report.count({ where: { externalSource: { not: null } } }),
      prisma.report.groupBy({
        by: ['externalSource'],
        where: { externalSource: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);
    const latest = await prisma.report.findFirst({
      where: { externalSource: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, externalSource: true },
    });
    res.json({ total, bySource, latestAt: latest?.createdAt, latestSource: latest?.externalSource });
  });
}
