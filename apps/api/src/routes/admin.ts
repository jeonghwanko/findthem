import type { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
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
import { getRecentDiff } from '../services/gitDiffService.js';
import { generateDevlogArticle } from '../services/devlogService.js';
import { createGhostPost } from '../services/ghostService.js';
import { TwitterAdapter } from '../platforms/twitter.js';
import { config } from '../config.js';
import { ERROR_CODES } from '@findthem/shared';
import type { AdminActionSource } from '@findthem/shared';

// ── 데브로그 트윗 헬퍼 ──

const twitterAdapter = new TwitterAdapter();

/** Twitter 280자 제한을 맞춰 데브로그 트윗 문구 생성 */
function buildDevlogTweet(title: string, excerpt: string, url: string): string {
  // Twitter가 URL을 항상 23자로 계산함
  const URL_COST = 23;
  const hashtags = '#FindThem #개발로그';
  const fixed = `📝 ${title}\n\n\n\n${hashtags}`;
  const budget = 280 - URL_COST - 1 - fixed.length; // URL + 개행 1칸
  const trimmedExcerpt = budget > 10 ? excerpt.slice(0, budget) + (excerpt.length > budget ? '…' : '') : '';
  return `📝 ${title}\n\n${trimmedExcerpt}\n\n${url}\n${hashtags}`;
}

// ── Query / Body 스키마 ──

const timelineQuerySchema = z.object({
  metric: z.enum(['reports', 'sightings', 'matches', 'users']),
  period: z.enum(['day', 'week', 'month']),
  from: z.string().optional(),
  to: z.string().optional(),
});

const failedJobsQuerySchema = z.object({
  queueName: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

const adminReportQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'FOUND', 'EXPIRED', 'SUSPENDED']).optional(),
  subjectType: z.enum(['PERSON', 'DOG', 'CAT']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const adminReportStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().optional(),
});

const adminMatchQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'NOTIFIED']).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const adminMatchStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
  reason: z.string().optional(),
});

const adminUserQuerySchema = z.object({
  q: z.string().optional(),
  isBlocked: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const adminBlockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().optional(),
});

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  targetType: z.string().optional(),
  source: z.enum(['DASHBOARD', 'AGENT', 'API']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const agentChatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

export function registerAdminRoutes(router: Router) {
  // ── 통계 API ──

  // GET /admin/stats/overview
  router.get('/admin/stats/overview', requireAdmin, async (_req, res) => {
    const stats = await getOverviewStats();
    res.json(stats);
  });

  // GET /admin/stats/timeline
  router.get('/admin/stats/timeline', requireAdmin, validateQuery(timelineQuerySchema), async (req, res) => {
    const { metric, period, from, to } = req.query as unknown as z.infer<typeof timelineQuerySchema>;
    const data = await getTimelineStats({ metric, period, from, to });
    res.json(data);
  });

  // GET /admin/stats/queues
  router.get('/admin/stats/queues', requireAdmin, async (_req, res) => {
    const queues = await getQueueStatuses();
    res.json(queues);
  });

  // GET /admin/stats/failed-jobs
  router.get('/admin/stats/failed-jobs', requireAdmin, validateQuery(failedJobsQuerySchema), async (req, res) => {
    const { queueName, limit } = req.query as unknown as z.infer<typeof failedJobsQuerySchema>;
    const jobs = await getFailedJobs(queueName, limit);
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
      throw new ApiError(400, ERROR_CODES.INVALID_QUEUE_NAME);
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
  router.get('/admin/reports', requireAdmin, validateQuery(adminReportQuerySchema), async (req, res) => {
    const { status, subjectType, q, page, limit } = req.query as unknown as z.infer<typeof adminReportQuerySchema>;

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
  router.patch('/admin/reports/:id/status', requireAdmin, validateBody(adminReportStatusSchema), async (req, res) => {
    const id = req.params.id as string;
    const { status, reason } = req.body as z.infer<typeof adminReportStatusSchema>;

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);

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
  router.get('/admin/matches', requireAdmin, validateQuery(adminMatchQuerySchema), async (req, res) => {
    const { status, minConfidence, page, limit } = req.query as unknown as z.infer<typeof adminMatchQuerySchema>;

    const where: Prisma.MatchWhereInput = {};
    if (status) where.status = status;
    if (minConfidence !== undefined) {
      where.confidence = { gte: minConfidence };
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
  router.patch('/admin/matches/:id/status', requireAdmin, validateBody(adminMatchStatusSchema), async (req, res) => {
    const id = req.params.id as string;
    const { status, reason } = req.body as z.infer<typeof adminMatchStatusSchema>;

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) throw new ApiError(404, ERROR_CODES.MATCH_NOT_FOUND);

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
  router.get('/admin/users', requireAdmin, validateQuery(adminUserQuerySchema), async (req, res) => {
    const { q, isBlocked, page, limit } = req.query as unknown as z.infer<typeof adminUserQuerySchema>;

    const where: Prisma.UserWhereInput = {};
    if (isBlocked !== undefined) where.isBlocked = isBlocked;
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
  router.patch('/admin/users/:id/block', requireAdmin, validateBody(adminBlockSchema), async (req, res) => {
    const id = req.params.id as string;
    const { blocked, reason } = req.body as z.infer<typeof adminBlockSchema>;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND);

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
  router.get('/admin/audit-logs', requireAdmin, validateQuery(auditLogQuerySchema), async (req, res) => {
    const { page, limit, targetType, source, from, to } = req.query as unknown as z.infer<typeof auditLogQuerySchema>;
    const result = await listAuditLogs({ page, limit, targetType, source, from, to });
    res.json(result);
  });

  // ── 에이전트 대화 API ──

  // POST /admin/agent/chat
  router.post('/admin/agent/chat', requireAdmin, adminLimiter, validateBody(agentChatSchema), async (req, res) => {
    const { sessionId, message } = req.body as z.infer<typeof agentChatSchema>;
    const result = await adminAgentService.chat(sessionId, message);
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
    if (!session) throw new ApiError(404, ERROR_CODES.SESSION_NOT_FOUND);
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
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, jobId: `manual-crawl-${Date.now()}` },
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

  // ── 데브로그 API ──

  interface DevlogRequestBody {
    context?: unknown;
    commitCount?: unknown;
    publishStatus?: unknown;
    tags?: unknown;
    twitterShare?: unknown;
  }

  function parseDevlogBody(body: DevlogRequestBody) {
    const { context, commitCount, publishStatus, tags, twitterShare } = body;

    if (typeof context !== 'string' || context.trim().length < 10) {
      throw new ApiError(400, ERROR_CODES.DEVLOG_CONTEXT_REQUIRED);
    }

    const resolvedCommitCount =
      typeof commitCount === 'number' && commitCount >= 1 && commitCount <= 20
        ? Math.floor(commitCount)
        : 5;

    const resolvedPublishStatus: 'draft' | 'published' =
      publishStatus === 'published' ? 'published' : 'draft';

    const resolvedTags: Array<{ name: string }> =
      Array.isArray(tags) && tags.every((t) => typeof t === 'string')
        ? (tags).map((t) => ({ name: t }))
        : [{ name: 'devlog' }];

    return {
      context: context.trim(),
      commitCount: resolvedCommitCount,
      publishStatus: resolvedPublishStatus,
      tags: resolvedTags,
      twitterShare: twitterShare === true,
    };
  }

  // POST /admin/devlog/preview — diff 추출 + AI 생성 (Ghost 포스팅 없이)
  router.post('/admin/devlog/preview', requireAdmin, async (req, res) => {
    res.setTimeout(60000);

    const { context, commitCount } = parseDevlogBody(req.body as DevlogRequestBody);

    const diffResult = await getRecentDiff(config.devlogRepoPath, commitCount);
    const { title, markdown, html, excerpt } = await generateDevlogArticle({ context, diffResult });

    res.json({
      title,
      markdown,
      html,
      excerpt,
      commitsSummary: diffResult.commitsSummary,
      diffStats: diffResult.diffStats,
    });
  });

  // POST /admin/devlog/generate — preview + Ghost CMS 포스팅 (+ 선택적 Twitter)
  router.post('/admin/devlog/generate', requireAdmin, async (req, res) => {
    res.setTimeout(60000);

    const { context, commitCount, publishStatus, tags, twitterShare } = parseDevlogBody(
      req.body as DevlogRequestBody,
    );

    const diffResult = await getRecentDiff(config.devlogRepoPath, commitCount);
    const { title, markdown, html, excerpt } = await generateDevlogArticle({ context, diffResult });

    const ghostResult = await createGhostPost({
      title,
      html,
      custom_excerpt: excerpt,
      tags,
      status: publishStatus,
    });

    // Twitter 게시 (published 상태 + twitterShare 플래그)
    let tweetId: string | null = null;
    let tweetUrl: string | null = null;
    if (twitterShare && publishStatus === 'published' && ghostResult.url) {
      const tweetText = buildDevlogTweet(title, excerpt, ghostResult.url);
      const tweetResult = await twitterAdapter.post(tweetText, []);
      tweetId = tweetResult.postId;
      tweetUrl = tweetResult.postUrl;
    }

    await createAuditLog({
      action: 'devlog.generate',
      targetType: 'Devlog',
      targetId: ghostResult.id,
      detail: { title, ghostUrl: ghostResult.url, commitCount, tweetId },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json({
      title,
      markdown,
      html,
      excerpt,
      ghostUrl: ghostResult.url,
      ghostPostId: ghostResult.id,
      tweetId,
      tweetUrl,
      commitsSummary: diffResult.commitsSummary,
      diffStats: diffResult.diffStats,
    });
  });

  // POST /admin/devlog/tweet — 기존 Ghost 아티클을 Twitter에 직접 게시 (수동 + 테스트용)
  router.post(
    '/admin/devlog/tweet',
    requireAdmin,
    validateBody(
      z.object({
        url: z.string().url(),
        title: z.string().min(1).max(200),
        excerpt: z.string().max(500).default(''),
      }),
    ),
    async (req, res) => {
      const { url, title, excerpt } = req.body as { url: string; title: string; excerpt: string };

      const tweetText = buildDevlogTweet(title, excerpt, url);
      const result = await twitterAdapter.post(tweetText, []);

      if (!result.postId) {
        throw new ApiError(502, ERROR_CODES.TWITTER_POST_FAILED);
      }

      await createAuditLog({
        action: 'devlog.tweet',
        targetType: 'Devlog',
        targetId: result.postId,
        detail: { title, url, tweetUrl: result.postUrl },
        source: 'DASHBOARD' as AdminActionSource,
      });

      res.json({ tweetId: result.postId, tweetUrl: result.postUrl, text: tweetText });
    },
  );
}
