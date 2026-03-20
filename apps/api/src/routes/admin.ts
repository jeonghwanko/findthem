import type { Router } from 'express';
import { Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
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
  outreachQueue,
  qaCrawlQueue,
  QUEUE_MAP,
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
import { storageService } from '../services/storageService.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateDevlogArticle } from '../services/devlogService.js';
import { createGhostPost, listGhostPosts, deleteGhostPost, updateGhostSettings, type GhostSettingInput } from '../services/ghostService.js';
import { TwitterAdapter } from '../platforms/twitter.js';
import { config } from '../config.js';
import { ERROR_CODES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, REPORT_STATUS_VALUES, SUBJECT_TYPE_VALUES, MATCH_STATUS_VALUES, ADMIN_ACTION_SOURCE_VALUES, INQUIRY_STATUS_VALUES, ADMIN_AGENT_IDS, OUTREACH_REQUEST_STATUS_VALUES, OUTREACH_CONTACT_TYPE_VALUES, AI_PROVIDER_VALUES } from '@findthem/shared';
import type { AdminActionSource } from '@findthem/shared';
import { getAllSettings, invalidateSettingsCache, getApiKey } from '../ai/aiSettings.js';
import { createLogger } from '../logger.js';

const log = createLogger('adminRoutes');

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
  status: z.enum(REPORT_STATUS_VALUES).optional(),
  subjectType: z.enum(SUBJECT_TYPE_VALUES).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const adminReportStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().optional(),
});

const adminMatchQuerySchema = z.object({
  status: z.enum(MATCH_STATUS_VALUES).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
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
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const adminBlockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().optional(),
});

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  targetType: z.string().optional(),
  source: z.enum(ADMIN_ACTION_SOURCE_VALUES).optional(),
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
  // SEC-W6: validateQuery 미들웨어로 queueName 입력 검증
  router.delete('/admin/stats/failed-jobs', requireAdmin, validateQuery(failedJobsQuerySchema), async (req, res) => {
    const { queueName } = req.query as unknown as z.infer<typeof failedJobsQuerySchema>;

    const validNames = Object.keys(QUEUE_MAP);

    if (queueName && !validNames.includes(queueName)) {
      throw new ApiError(400, ERROR_CODES.INVALID_QUEUE_NAME);
    }

    const targets: string[] = queueName ? [queueName] : validNames;
    const results: Record<string, number> = {};

    for (const name of targets) {
      const queue = QUEUE_MAP[name];
      if (queue) {
        const removed = await queue.clean(5_000, 10_000, 'failed');
        results[name] = removed.length;
      }
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

    const result = await prisma.report.updateMany({
      where: { id, status: report.status },
      data: { status },
    });

    if (result.count === 0) throw new ApiError(409, ERROR_CODES.REPORT_STATUS_CONFLICT);

    const updated = await prisma.report.findUnique({ where: { id } });

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

    const result = await prisma.match.updateMany({
      where: { id, status: match.status },
      data: { status, reviewedAt: new Date() },
    });

    if (result.count === 0) throw new ApiError(409, ERROR_CODES.REPORT_STATUS_CONFLICT);

    const updated = await prisma.match.findUnique({ where: { id } });

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
      try {
        const tweetText = buildDevlogTweet(title, excerpt, ghostResult.url);
        const tweetResult = await twitterAdapter.post(tweetText, []);
        tweetId = tweetResult.postId;
        tweetUrl = tweetResult.postUrl ?? null;
      } catch (twitterErr) {
        log.warn({ err: twitterErr }, 'Twitter 게시 실패 (non-fatal) — Ghost 포스트는 정상 게시됨');
      }
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

  // POST /admin/devlog/site-settings — Ghost 네비게이션/구독버튼 일괄 설정
  router.post('/admin/devlog/site-settings', requireAdmin, async (_req, res) => {
    const siteUrl = config.siteUrl;
    const navSettings: GhostSettingInput[] = [
      {
        key: 'navigation',
        value: JSON.stringify([
          { label: 'Home', url: siteUrl },
          { label: 'About', url: `${siteUrl}/team` },
          { label: 'Sign in', url: `${siteUrl}/login` },
        ]),
      },
      { key: 'portal_button', value: false },
    ];
    await updateGhostSettings(navSettings);
    res.json({ ok: true });
  });

  // GET /admin/devlog/list — Ghost 포스트 목록 조회
  const devlogListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(15),
  });

  router.get('/admin/devlog/list', requireAdmin, validateQuery(devlogListQuerySchema), async (req, res) => {
    const { page, limit } = req.query as unknown as z.infer<typeof devlogListQuerySchema>;
    const result = await listGhostPosts(page, limit);
    res.json(result);
  });

  // DELETE /admin/devlog/:id — Ghost 포스트 삭제
  router.delete('/admin/devlog/:id', requireAdmin, async (req, res) => {
    const id = req.params.id as string;
    if (!id || !/^[0-9a-f]{24}$/.test(id)) {
      throw new ApiError(400, ERROR_CODES.PATH_TRAVERSAL);
    }
    await deleteGhostPost(id);
    await createAuditLog({
      action: 'devlog.delete',
      targetType: 'Devlog',
      targetId: id,
      detail: {},
      source: 'DASHBOARD' as AdminActionSource,
    });
    res.json({ ok: true });
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

  // ── 깨진 사진 레코드 정리 (배치 처리) ──
  router.post('/admin/cleanup-broken-photos', requireAdmin, async (_req, res) => {
    const BATCH_SIZE = 500;
    let totalScanned = 0;
    let totalBroken = 0;
    let totalDeleted = 0;
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const photos = await prisma.reportPhoto.findMany({
        select: { id: true, photoUrl: true },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (photos.length === 0) break;
      cursor = photos[photos.length - 1].id;
      totalScanned += photos.length;

      const brokenIds: string[] = [];
      for (const photo of photos) {
        const url = photo.photoUrl;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          brokenIds.push(photo.id);
          continue;
        }
        const filePath = url.startsWith('/uploads/')
          ? resolve(config.uploadDir, url.replace('/uploads/', ''))
          : resolve(config.uploadDir, url);
        // SEC-C2: 크롤 데이터의 ../../ 경로 탐색 방지 — uploadDir 밖이면 broken 처리
        try {
          storageService.getAbsolutePath(url.startsWith('/uploads/') ? url : `/uploads/${url}`);
        } catch {
          brokenIds.push(photo.id);
          continue;
        }
        if (!existsSync(filePath)) {
          brokenIds.push(photo.id);
        }
      }

      if (brokenIds.length > 0) {
        const result = await prisma.reportPhoto.deleteMany({
          where: { id: { in: brokenIds } },
        });
        totalBroken += brokenIds.length;
        totalDeleted += result.count;
      }

      if (photos.length < BATCH_SIZE) break;
    }

    res.json({ total: totalScanned, broken: totalBroken, deleted: totalDeleted });
  });

  // ── 아웃리치 관리 API ──

  const outreachQuerySchema = z.object({
    status: z.enum(OUTREACH_REQUEST_STATUS_VALUES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  });

  const outreachApproveSchema = z.object({
    content: z.string().min(1).max(10000).optional(),
    subject: z.string().min(1).max(200).optional(),
  });

  const outreachContactQuerySchema = z.object({
    type: z.enum(OUTREACH_CONTACT_TYPE_VALUES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  });

  const outreachContactCreateSchema = z.object({
    type: z.enum(OUTREACH_CONTACT_TYPE_VALUES),
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    youtubeChannelId: z.string().optional(),
    youtubeChannelUrl: z.string().url().optional(),
    organization: z.string().optional(),
    topics: z.array(z.string()).default([]),
    subscriberCount: z.number().int().nonnegative().optional(),
  });

  // GET /admin/outreach — 아웃리치 요청 목록 (정적 라우트: /admin/outreach/contacts 보다 먼저)
  router.get('/admin/outreach', requireAdmin, validateQuery(outreachQuerySchema), async (req, res) => {
    const { status, page, limit } = req.query as unknown as z.infer<typeof outreachQuerySchema>;

    const where: Prisma.OutreachRequestWhereInput = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.outreachRequest.findMany({
        where,
        include: {
          report: {
            select: {
              id: true,
              name: true,
              subjectType: true,
              lastSeenAddress: true,
              photos: { where: { isPrimary: true }, take: 1, select: { thumbnailUrl: true } },
            },
          },
          contact: {
            select: {
              id: true,
              type: true,
              name: true,
              email: true,
              youtubeChannelUrl: true,
              videoId: true,
              videoTitle: true,
              organization: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.outreachRequest.count({ where }),
    ]);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  });

  // GET /admin/outreach/contacts — 컨택 목록 (정적 경로, 동적 :id 보다 먼저)
  router.get(
    '/admin/outreach/contacts',
    requireAdmin,
    validateQuery(outreachContactQuerySchema),
    async (req, res) => {
      const { type, page, limit } = req.query as unknown as z.infer<typeof outreachContactQuerySchema>;

      const where: Prisma.OutreachContactWhereInput = { isActive: true };
      if (type) where.type = type;

      const [items, total] = await Promise.all([
        prisma.outreachContact.findMany({
          where,
          include: {
            _count: { select: { outreachRequests: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.outreachContact.count({ where }),
      ]);

      res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
    },
  );

  // POST /admin/outreach/contacts — 컨택 수동 등록
  router.post(
    '/admin/outreach/contacts',
    requireAdmin,
    validateBody(outreachContactCreateSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof outreachContactCreateSchema>;

      const contact = await prisma.outreachContact.create({
        data: {
          type: body.type,
          name: body.name,
          email: body.email,
          youtubeChannelId: body.youtubeChannelId,
          youtubeChannelUrl: body.youtubeChannelUrl,
          organization: body.organization,
          topics: body.topics,
          subscriberCount: body.subscriberCount,
          source: 'MANUAL',
          isActive: true,
        },
      });

      await createAuditLog({
        action: 'outreach.contact.create',
        targetType: 'OutreachContact',
        targetId: contact.id,
        detail: { type: contact.type, name: contact.name },
        source: 'DASHBOARD' as AdminActionSource,
      });

      res.status(201).json(contact);
    },
  );

  // PATCH /admin/outreach/:id/approve — 승인 (본문 수정 가능, FAILED 재시도 포함)
  router.patch(
    '/admin/outreach/:id/approve',
    requireAdmin,
    validateBody(outreachApproveSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const { content, subject } = req.body as z.infer<typeof outreachApproveSchema>;

      // Check existence first so we can return 404 vs 409 correctly
      const request = await prisma.outreachRequest.findUnique({ where: { id } });
      if (!request) throw new ApiError(404, ERROR_CODES.OUTREACH_NOT_FOUND);

      const updateData: Prisma.OutreachRequestUpdateInput = {
        status: 'APPROVED',
        approvedAt: new Date(),
      };
      if (content) updateData.draftContent = content;
      if (subject) updateData.draftSubject = subject;

      // Use updateMany with a status filter to prevent double-send race condition.
      // Only PENDING_APPROVAL and FAILED requests can be approved/retried.
      const updated = await prisma.outreachRequest.updateMany({
        where: { id, status: { in: ['PENDING_APPROVAL', 'FAILED'] } },
        data: updateData,
      });

      if (updated.count === 0) {
        throw new ApiError(409, ERROR_CODES.OUTREACH_ALREADY_PROCESSED);
      }

      // 발송 큐에 등록
      await outreachQueue.add(
        'send-outreach',
        { type: 'send-outreach', outreachRequestId: id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );

      await createAuditLog({
        action: 'outreach.request.approve',
        targetType: 'OutreachRequest',
        targetId: id,
        detail: { channel: request.channel, reportId: request.reportId },
        source: 'DASHBOARD' as AdminActionSource,
      });

      res.json({ id, status: 'APPROVED' });
    },
  );

  // PATCH /admin/outreach/:id/reject — 거절
  router.patch('/admin/outreach/:id/reject', requireAdmin, async (req, res) => {
    const id = req.params.id as string;

    // Check existence first so we can return 404 vs 409 correctly
    const request = await prisma.outreachRequest.findUnique({ where: { id } });
    if (!request) throw new ApiError(404, ERROR_CODES.OUTREACH_NOT_FOUND);

    // Use updateMany with status filter to prevent race conditions.
    // Only PENDING_APPROVAL requests can be rejected.
    const updated = await prisma.outreachRequest.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: { status: 'REJECTED' },
    });

    if (updated.count === 0) {
      throw new ApiError(409, ERROR_CODES.OUTREACH_ALREADY_PROCESSED);
    }

    await createAuditLog({
      action: 'outreach.request.reject',
      targetType: 'OutreachRequest',
      targetId: id,
      detail: { channel: request.channel, reportId: request.reportId },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json({ id, status: 'REJECTED' });
  });

  // POST /admin/outreach/trigger — 수동 아웃리치 스캔 실행
  router.post('/admin/outreach/trigger', requireAdmin, adminLimiter, async (_req, res) => {
    const job = await outreachQueue.add(
      'discover-contacts',
      { type: 'discover-contacts' as const },
      { jobId: `manual-outreach-${Date.now()}` },
    );

    await createAuditLog({
      action: 'outreach.trigger',
      targetType: 'OutreachRequest',
      targetId: job.id ?? '',
      detail: { trigger: 'manual' },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json({ jobId: job.id });
  });

  // ── AI 설정 API ──

  const aiSettingUpdateSchema = z.object({
    key: z.string().min(1).max(200),
    value: z.string().min(1).max(500).nullable(),
  });

  const aiUsageQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    agentId: z.string().optional(),
    provider: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  const PROVIDER_MODELS: Record<string, string[]> = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview'],
    openai: ['gpt-4o-mini', 'gpt-4o'],
  };

  // GET /admin/ai/settings
  router.get('/admin/ai/settings', requireAdmin, async (_req, res) => {
    const settings = await getAllSettings();

    const defaultProvider = settings.get('default_provider') ?? 'gemini';
    const defaultModel = settings.get('default_model') ?? 'gemini-2.5-flash';

    const agents: Record<string, { provider: string | null; model: string | null }> = {};
    for (const agentId of ADMIN_AGENT_IDS) {
      agents[agentId] = {
        provider: settings.get(`agent:${agentId}:provider`) ?? null,
        model: settings.get(`agent:${agentId}:model`) ?? null,
      };
    }

    const availableProviders = await Promise.all(
      Object.entries(PROVIDER_MODELS).map(async ([name, models]) => ({
        name,
        configured: !!(await getApiKey(name)),
        models,
      })),
    );

    res.json({ defaultProvider, defaultModel, agents, availableProviders });
  });

  // PUT /admin/ai/settings
  router.put('/admin/ai/settings', requireAdmin, validateBody(aiSettingUpdateSchema), async (req, res) => {
    const { key, value } = req.body as z.infer<typeof aiSettingUpdateSchema>;

    if (value === null) {
      await prisma.aiSetting.deleteMany({ where: { key } });
    } else {
      await prisma.aiSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }

    invalidateSettingsCache();

    await createAuditLog({
      action: 'ai.setting.update',
      targetType: 'AiSetting',
      targetId: key,
      detail: { key, value },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json({ key, value });
  });

  // GET /admin/ai/usage
  router.get('/admin/ai/usage', requireAdmin, validateQuery(aiUsageQuerySchema), async (req, res) => {
    const { from, to, agentId, provider, page, limit } = req.query as unknown as z.infer<typeof aiUsageQuerySchema>;

    const where: {
      createdAt?: { gte?: Date; lte?: Date };
      agentId?: string;
      provider?: string;
    } = {};

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (agentId) where.agentId = agentId;
    if (provider) where.provider = provider;

    const [items, totalCalls] = await Promise.all([
      prisma.aiUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.aiUsageLog.count({ where }),
    ]);

    // 집계: DB 레벨 groupBy로 처리 (전체 레코드 메모리 로드 방지)
    const [byAgentRaw, byProviderRaw, aggregates] = await Promise.all([
      prisma.aiUsageLog.groupBy({
        by: ['agentId'],
        where,
        _count: { id: true },
        _sum: { totalTokens: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ['provider'],
        where,
        _count: { id: true },
        _sum: { totalTokens: true },
      }),
      prisma.aiUsageLog.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, latencyMs: true },
        _count: { id: true },
      }),
    ]);

    const successCount = await prisma.aiUsageLog.count({ where: { ...where, success: true } });
    const total = aggregates._count.id;

    const byAgent: Record<string, { calls: number; tokens: number }> = {};
    for (const row of byAgentRaw) {
      byAgent[row.agentId] = { calls: row._count.id, tokens: row._sum.totalTokens ?? 0 };
    }

    const byProvider: Record<string, { calls: number; tokens: number }> = {};
    for (const row of byProviderRaw) {
      byProvider[row.provider] = { calls: row._count.id, tokens: row._sum.totalTokens ?? 0 };
    }

    res.json({
      items,
      summary: {
        totalCalls,
        totalInputTokens: aggregates._sum.inputTokens ?? 0,
        totalOutputTokens: aggregates._sum.outputTokens ?? 0,
        avgLatencyMs: total > 0 ? Math.round((aggregates._sum.latencyMs ?? 0) / total) : 0,
        successRate: total > 0 ? Math.round((successCount / total) * 10000) / 10000 : 1,
        byAgent,
        byProvider,
      },
    });
  });

  // GET /admin/ai/usage/summary — 집계 전용 (빠른 대시보드용)
  router.get('/admin/ai/usage/summary', requireAdmin, async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };

    const where: {
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from as string);
      if (to) where.createdAt.lte = new Date(to as string);
    }

    const [totalCalls, byAgentRaw, byProviderRaw, latencyStats] = await Promise.all([
      prisma.aiUsageLog.count({ where }),
      prisma.aiUsageLog.groupBy({
        by: ['agentId'],
        where,
        _count: { id: true },
        _sum: { totalTokens: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ['provider'],
        where,
        _count: { id: true },
        _sum: { totalTokens: true },
      }),
      prisma.aiUsageLog.aggregate({
        where,
        _avg: { latencyMs: true },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ]);

    const successCount = await prisma.aiUsageLog.count({ where: { ...where, success: true } });

    const byAgent: Record<string, { calls: number; tokens: number }> = {};
    for (const row of byAgentRaw) {
      byAgent[row.agentId] = { calls: row._count.id, tokens: row._sum.totalTokens ?? 0 };
    }

    const byProvider: Record<string, { calls: number; tokens: number }> = {};
    for (const row of byProviderRaw) {
      byProvider[row.provider] = { calls: row._count.id, tokens: row._sum.totalTokens ?? 0 };
    }

    res.json({
      totalCalls,
      totalInputTokens: latencyStats._sum.inputTokens ?? 0,
      totalOutputTokens: latencyStats._sum.outputTokens ?? 0,
      avgLatencyMs: Math.round(latencyStats._avg.latencyMs ?? 0),
      successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 10000) / 10000 : 1,
      byAgent,
      byProvider,
    });
  });

  // ── API 키 관리 ──

  const API_KEY_PROVIDERS = AI_PROVIDER_VALUES;

  // GET /admin/ai/keys — API 키 상태 (마스킹)
  router.get('/admin/ai/keys', requireAdmin, async (_req, res) => {
    const keys: Record<string, { configured: boolean; masked: string }> = {};
    for (const provider of API_KEY_PROVIDERS) {
      const dbKey = await prisma.aiSetting.findUnique({ where: { key: `api_key_${provider}` } });
      const envKey = provider === 'anthropic' ? config.anthropicApiKey
        : provider === 'gemini' ? config.geminiApiKey
        : config.openaiApiKey;
      const rawKey = dbKey?.value || envKey;
      keys[provider] = {
        configured: !!rawKey,
        masked: rawKey
          ? (rawKey.length > 16 ? `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}` : '***configured***')
          : '',
      };
    }
    res.json(keys);
  });

  // PUT /admin/ai/keys — API 키 저장 (DB에 저장, 런타임 반영)
  const aiKeyUpdateSchema = z.object({
    provider: z.enum(AI_PROVIDER_VALUES),
    apiKey: z.string().min(1).max(500),
  });

  router.put('/admin/ai/keys', requireAdmin, validateBody(aiKeyUpdateSchema), async (req, res) => {
    const { provider, apiKey } = req.body as z.infer<typeof aiKeyUpdateSchema>;

    await prisma.aiSetting.upsert({
      where: { key: `api_key_${provider}` },
      create: { key: `api_key_${provider}`, value: apiKey },
      update: { value: apiKey },
    });

    await createAuditLog({
      action: 'ai.key.update',
      targetType: 'AiSetting',
      targetId: `api_key_${provider}`,
      detail: { provider, masked: `${apiKey.slice(0, 8)}...` },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json({ success: true });
  });

  // ── 외부 에이전트 관리 API ──

  const externalAgentCreateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    avatarUrl: z.string().url().optional(),
    webhookUrl: z.string().url().optional(),
  });

  const externalAgentUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    avatarUrl: z.string().url().optional().nullable(),
    webhookUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
  });

  const externalAgentListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  });

  // GET /admin/external-agents
  router.get('/admin/external-agents', requireAdmin, validateQuery(externalAgentListQuerySchema), async (req, res) => {
    const { page, limit } = req.query as unknown as z.infer<typeof externalAgentListQuerySchema>;

    const [items, total] = await Promise.all([
      prisma.externalAgent.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          avatarUrl: true,
          webhookUrl: true,
          isActive: true,
          createdAt: true,
          lastUsedAt: true,
          _count: { select: { posts: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.externalAgent.count(),
    ]);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  });

  // POST /admin/external-agents
  router.post('/admin/external-agents', requireAdmin, validateBody(externalAgentCreateSchema), async (req, res) => {
    const { name, description, avatarUrl, webhookUrl } = req.body as z.infer<typeof externalAgentCreateSchema>;

    const rawKey = randomBytes(32).toString('hex');
    const apiKey = createHash('sha256').update(rawKey).digest('hex');

    const agent = await prisma.externalAgent.create({
      data: { name, description, avatarUrl, webhookUrl, apiKey },
    });

    await createAuditLog({
      action: 'external_agent.create',
      targetType: 'ExternalAgent',
      targetId: agent.id,
      detail: { name },
      source: 'DASHBOARD' as AdminActionSource,
    });

    // rawKey는 생성 시 한 번만 응답에 포함 (DB에는 해시만 저장)
    res.status(201).json({
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatarUrl: agent.avatarUrl,
        webhookUrl: agent.webhookUrl,
        isActive: agent.isActive,
        createdAt: agent.createdAt,
      },
      apiKey: rawKey,
    });
  });

  // PATCH /admin/external-agents/:id
  router.patch('/admin/external-agents/:id', requireAdmin, validateBody(externalAgentUpdateSchema), async (req, res) => {
    const id = req.params.id as string;
    const body = req.body as z.infer<typeof externalAgentUpdateSchema>;

    const existing = await prisma.externalAgent.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, ERROR_CODES.EXTERNAL_AGENT_NOT_FOUND);

    const updated = await prisma.externalAgent.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
        ...(body.webhookUrl !== undefined && { webhookUrl: body.webhookUrl }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        webhookUrl: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    await createAuditLog({
      action: 'external_agent.update',
      targetType: 'ExternalAgent',
      targetId: id,
      detail: body,
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json(updated);
  });

  // DELETE /admin/external-agents/:id
  router.delete('/admin/external-agents/:id', requireAdmin, async (req, res) => {
    const id = req.params.id as string;

    const existing = await prisma.externalAgent.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, ERROR_CODES.EXTERNAL_AGENT_NOT_FOUND);

    await prisma.externalAgent.delete({ where: { id } });

    await createAuditLog({
      action: 'external_agent.delete',
      targetType: 'ExternalAgent',
      targetId: id,
      detail: { name: existing.name },
      source: 'DASHBOARD' as AdminActionSource,
    });

    res.json({ success: true });
  });

  // POST /admin/ai/keys/test — API 키 테스트
  const aiKeyTestSchema = z.object({
    provider: z.enum(AI_PROVIDER_VALUES),
    apiKey: z.string().optional(), // 생략 시 저장된 키 사용
  });

  router.post('/admin/ai/keys/test', requireAdmin, adminLimiter, validateBody(aiKeyTestSchema), async (req, res) => {
    const { provider, apiKey: inputKey } = req.body as z.infer<typeof aiKeyTestSchema>;

    // 테스트할 키 결정: 입력 > DB > env
    let testKey = inputKey;
    if (!testKey) {
      const dbKey = await prisma.aiSetting.findUnique({ where: { key: `api_key_${provider}` } });
      const envKey = provider === 'anthropic' ? config.anthropicApiKey
        : provider === 'gemini' ? config.geminiApiKey
        : config.openaiApiKey;
      testKey = dbKey?.value || envKey;
    }

    if (!testKey) {
      res.json({ success: false, error: 'API 키가 설정되지 않았습니다.', latencyMs: 0 });
      return;
    }

    const start = Date.now();
    try {
      if (provider === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': testKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 16, messages: [{ role: 'user', content: 'Hi' }] }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = await r.json() as Record<string, unknown>;
        if (!r.ok) throw new Error((body.error as Record<string, string>)?.message ?? `HTTP ${r.status}`);
        res.json({ success: true, model: (body.model as string) ?? 'claude', latencyMs: Date.now() - start });
      } else if (provider === 'gemini') {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
          method: 'POST',
          headers: { 'x-goog-api-key': testKey, 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 16 } }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = await r.json() as Record<string, unknown>;
        if (!r.ok) throw new Error((body.error as Record<string, string>)?.message ?? `HTTP ${r.status}`);
        res.json({ success: true, model: 'gemini-2.5-flash', latencyMs: Date.now() - start });
      } else {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${testKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 16 }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = await r.json() as Record<string, unknown>;
        if (!r.ok) throw new Error((body.error as Record<string, string>)?.message ?? `HTTP ${r.status}`);
        res.json({ success: true, model: (body.model as string) ?? 'gpt-4o-mini', latencyMs: Date.now() - start });
      }
    } catch (err) {
      res.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error', latencyMs: Date.now() - start });
    }
  });

  // POST /admin/qa-crawl/trigger — Q&A 크롤 수동 실행
  router.post('/admin/qa-crawl/trigger', requireAdmin, async (_req, res) => {
    await qaCrawlQueue.add(
      'qa-crawl-run',
      { triggeredBy: 'manual' },
      { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
    );
    res.json({ success: true, message: 'Q&A crawl job queued' });
  });

  // ── 문의 관리 API ──

  const adminInquiryQuerySchema = z.object({
    status: z.enum(INQUIRY_STATUS_VALUES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  });

  const adminInquiryReplySchema = z.object({
    replyContent: z.string().min(1).max(5000),
  });

  // GET /admin/inquiries — 문의 목록
  router.get(
    '/admin/inquiries',
    requireAdmin,
    validateQuery(adminInquiryQuerySchema),
    async (req, res) => {
      const { status, page, limit } = req.query as unknown as z.infer<
        typeof adminInquiryQuerySchema
      >;

      const where: Prisma.InquiryWhereInput = {};
      if (status) where.status = status;

      const [items, total] = await Promise.all([
        prisma.inquiry.findMany({
          where,
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.inquiry.count({ where }),
      ]);

      res.json({
        items: items.map((item) => ({
          ...item,
          repliedAt: item.repliedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    },
  );

  // PATCH /admin/inquiries/:id/reply — 문의 답변
  router.patch(
    '/admin/inquiries/:id/reply',
    requireAdmin,
    validateBody(adminInquiryReplySchema),
    async (req, res) => {
      const id = req.params.id as string;
      const { replyContent } = req.body as z.infer<typeof adminInquiryReplySchema>;

      let updated;
      try {
        updated = await prisma.inquiry.update({
          where: { id },
          data: {
            replyContent,
            repliedAt: new Date(),
            status: 'REPLIED',
          },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ApiError(404, ERROR_CODES.INQUIRY_NOT_FOUND);
        }
        throw err;
      }

      log.info({ inquiryId: id }, 'Inquiry replied');

      res.json({
        ...updated,
        repliedAt: updated.repliedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    },
  );
}
