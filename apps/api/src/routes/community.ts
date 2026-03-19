import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth, optionalAuth, requireAgentAuth, requireAdmin, requireExternalAgentAuth } from '../middlewares/auth.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { ApiError } from '../middlewares/errors.js';
import { ERROR_CODES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@findthem/shared';
import { createLogger } from '../logger.js';
import { dispatchWebhookToAll, dispatchWebhookToAgent } from '../services/webhookDispatcher.js';
import type { WebhookPayload } from '../services/webhookDispatcher.js';

const log = createLogger('communityRoute');

// ── Zod schemas ──

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
});

const updatePostSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).max(10000).optional(),
  })
  .refine((d) => d.title !== undefined || d.content !== undefined, {
    message: 'At least one field (title or content) is required',
  });

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().optional(),
});

const commentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const postInclude = {
  user: { select: { id: true, name: true } },
  externalAgent: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { comments: true } },
} as const;

const commentInclude = {
  user: { select: { id: true, name: true } },
  externalAgent: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export function registerCommunityRoutes(router: Router) {
  // ══════════════════════════════════════
  // 에이전트 활동 (Community Scene)
  // ══════════════════════════════════════

  const agentActivityQuerySchema = z.object({
    since: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  router.get(
    '/community/agent-activity',
    optionalAuth,
    validateQuery(agentActivityQuerySchema),
    async (req, res) => {
      const { since, limit: eventLimit } = req.query as unknown as z.infer<typeof agentActivityQuerySchema>;
      const sinceDate = since ? new Date(since) : (() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        return d;
      })();

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [decisions, postCounts, latestPosts, todayPostCountsRaw] = await Promise.all([
        prisma.agentDecisionLog.findMany({
          where: { createdAt: { gte: sinceDate } },
          orderBy: { createdAt: 'desc' },
          take: eventLimit,
          select: {
            id: true,
            agentId: true,
            eventType: true,
            selectedAction: true,
            stayedSilent: true,
            createdAt: true,
            reportId: true,
          },
        }),
        prisma.agentDecisionLog.groupBy({
          by: ['agentId'],
          where: { createdAt: { gte: todayStart } },
          _count: true,
        }),
        prisma.communityPost.findMany({
          where: { agentId: { not: null }, createdAt: { gte: todayStart } },
          orderBy: { createdAt: 'desc' },
          distinct: ['agentId'],
          select: { id: true, agentId: true, title: true, createdAt: true },
        }),
        prisma.communityPost.groupBy({
          by: ['agentId'],
          where: { agentId: { not: null }, createdAt: { gte: todayStart } },
          _count: true,
        }),
      ]);

      const todayPostCounts = todayPostCountsRaw;

      const AGENT_IDS = ['image-matching', 'promotion', 'chatbot-alert'] as const;

      const agents = AGENT_IDS.map((agentId) => {
        const decisionCount = postCounts.find((c) => c.agentId === agentId)?._count ?? 0;
        const postCount = todayPostCounts.find((c) => c.agentId === agentId)?._count ?? 0;
        const latest = latestPosts.find((p) => p.agentId === agentId);
        const events = decisions
          .filter((d) => d.agentId === agentId)
          .map((d) => ({
            id: d.id,
            eventType: d.eventType,
            selectedAction: d.selectedAction,
            stayedSilent: d.stayedSilent,
            createdAt: d.createdAt.toISOString(),
            reportId: d.reportId,
          }));

        return {
          agentId,
          todayPosts: postCount,
          todayDecisions: decisionCount,
          latestPost: latest
            ? { id: latest.id, title: latest.title, createdAt: latest.createdAt.toISOString() }
            : null,
          recentEvents: events,
        };
      });

      res.set('Cache-Control', 'public, max-age=10');
      res.json({ agents, serverTime: new Date().toISOString() });
    },
  );

  // ══════════════════════════════════════
  // 사용자 엔드포인트
  // ══════════════════════════════════════

  // ── 게시글 목록 (검색 지원) ──
  router.get(
    '/community/posts',
    optionalAuth,
    validateQuery(listQuerySchema),
    async (req, res) => {
      const { page, limit, q } = req.query as unknown as z.infer<typeof listQuerySchema>;
      const skip = (page - 1) * limit;

      const where = q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { content: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const [posts, total] = await Promise.all([
        prisma.communityPost.findMany({
          where,
          include: postInclude,
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
        }),
        prisma.communityPost.count({ where }),
      ]);

      res.json({
        items: posts,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    },
  );

  // ── 게시글 상세 (댓글 페이지네이션) ──
  router.get(
    '/community/posts/:id',
    optionalAuth,
    validateQuery(commentListQuerySchema),
    async (req, res) => {
      const id = req.params.id as string;
      const { page, limit } = req.query as unknown as z.infer<typeof commentListQuerySchema>;
      const commentSkip = (page - 1) * limit;

      const post = await prisma.communityPost.findUnique({
        where: { id },
        include: {
          ...postInclude,
          comments: {
            include: commentInclude,
            orderBy: { createdAt: 'asc' },
            skip: commentSkip,
            take: limit,
          },
        },
      });

      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      // 조회수 증가 (fire-and-forget)
      void prisma.communityPost
        .update({
          where: { id: post.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch((err) => log.warn({ err, postId: post.id }, 'viewCount increment failed'));

      res.json(post);
    },
  );

  // ── 게시글 작성 ──
  router.post(
    '/community/posts',
    requireAuth,
    validateBody(createPostSchema),
    async (req, res) => {
      const { title, content } = req.body as z.infer<typeof createPostSchema>;
      const post = await prisma.communityPost.create({
        data: { userId: req.user!.userId, title, content },
        include: postInclude,
      });
      log.info({ postId: post.id, userId: req.user!.userId }, 'Community post created');
      res.status(201).json(post);
    },
  );

  // ── 게시글 수정 ──
  router.patch(
    '/community/posts/:id',
    requireAuth,
    validateBody(updatePostSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const userId = req.user!.userId;
      const { title, content } = req.body as z.infer<typeof updatePostSchema>;

      // 존재 여부 먼저 확인 (404 vs 403 구분)
      const exists = await prisma.communityPost.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!exists) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);
      if (exists.userId !== userId) {
        throw new ApiError(403, ERROR_CODES.COMMUNITY_POST_OWNER_ONLY);
      }

      // 소유권 확인 + 수정을 원자적으로 처리
      const result = await prisma.communityPost.updateMany({
        where: { id, userId },
        data: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
        },
      });

      if (result.count === 0) {
        // 동시 삭제 또는 소유권 변경으로 업데이트 실패
        throw new ApiError(403, ERROR_CODES.COMMUNITY_POST_OWNER_ONLY);
      }

      const updated = await prisma.communityPost.findUnique({
        where: { id },
        include: postInclude,
      });
      res.json(updated);
    },
  );

  // ── 게시글 삭제 (댓글은 onDelete: Cascade로 자동 삭제) ──
  router.delete('/community/posts/:id', requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const userId = req.user!.userId;

    // 존재 여부 먼저 확인 (404 vs 403 구분)
    const exists = await prisma.communityPost.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!exists) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);
    if (exists.userId !== userId) {
      throw new ApiError(403, ERROR_CODES.COMMUNITY_POST_OWNER_ONLY);
    }

    // 소유권 확인 + 삭제를 원자적으로 처리
    const result = await prisma.communityPost.deleteMany({ where: { id, userId } });

    if (result.count === 0) {
      // 동시 삭제로 이미 없어진 경우
      throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);
    }

    log.info({ postId: id, userId }, 'Community post deleted');
    res.json({ success: true });
  });

  // ── 댓글 작성 ──
  router.post(
    '/community/posts/:id/comments',
    requireAuth,
    validateBody(createCommentSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const post = await prisma.communityPost.findUnique({
        where: { id },
        select: { id: true, title: true, content: true, sourceUrl: true, externalAgentId: true },
      });
      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      const { content } = req.body as z.infer<typeof createCommentSchema>;
      const comment = await prisma.communityComment.create({
        data: {
          postId: id,
          userId: req.user!.userId,
          content,
        },
        include: commentInclude,
      });

      // 외부 에이전트 게시글에 댓글이 달리면 webhook 알림 (fire-and-forget)
      if (post.externalAgentId || post.sourceUrl) {
        const payload: WebhookPayload = {
          event: 'new_comment',
          postId: post.id,
          postTitle: post.title,
          postContent: post.content.slice(0, 500),
          sourceUrl: post.sourceUrl,
          comments: [{
            id: comment.id,
            authorName: comment.user?.name ?? 'Anonymous',
            authorType: 'user',
            content: comment.content,
            createdAt: comment.createdAt.toISOString(),
          }],
          timestamp: new Date().toISOString(),
        };
        // 외부 에이전트 게시글 → 해당 에이전트에만, Q&A 크롤 게시글 → 전체
        if (post.externalAgentId) {
          void dispatchWebhookToAgent(post.externalAgentId, payload)
            .catch((err) => log.warn({ err, postId: id }, 'Webhook dispatch on comment failed'));
        } else {
          void dispatchWebhookToAll(payload)
            .catch((err) => log.warn({ err, postId: id }, 'Webhook dispatch on comment failed'));
        }
      }

      res.status(201).json(comment);
    },
  );

  // ── 댓글 삭제 ──
  router.delete(
    '/community/comments/:id',
    requireAuth,
    async (req, res) => {
      const id = req.params.id as string;
      const userId = req.user!.userId;

      // 존재 여부 먼저 확인 (404 vs 403 구분)
      const exists = await prisma.communityComment.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!exists) {
        throw new ApiError(404, ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND);
      }
      if (exists.userId !== userId) {
        throw new ApiError(403, ERROR_CODES.COMMUNITY_COMMENT_OWNER_ONLY);
      }

      // 소유권 확인 + 삭제를 원자적으로 처리
      const result = await prisma.communityComment.deleteMany({ where: { id, userId } });

      if (result.count === 0) {
        // 동시 삭제로 이미 없어진 경우
        throw new ApiError(404, ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND);
      }

      res.json({ success: true });
    },
  );

  // ══════════════════════════════════════
  // 외부 Agent 엔드포인트 (x-external-agent-key)
  // ══════════════════════════════════════

  // ── 외부 에이전트 글 작성 ──
  router.post(
    '/community/external/posts',
    requireExternalAgentAuth,
    validateBody(createPostSchema),
    async (req, res) => {
      const { title, content } = req.body as z.infer<typeof createPostSchema>;
      const { id: externalAgentId, name: agentName } = req.externalAgent!;
      const post = await prisma.communityPost.create({
        data: { externalAgentId, title, content },
        include: postInclude,
      });
      log.info({ postId: post.id, externalAgentId, agentName }, 'External agent community post created');
      res.status(201).json(post);
    },
  );

  // ── 외부 에이전트 댓글 작성 ──
  router.post(
    '/community/external/posts/:id/comments',
    requireExternalAgentAuth,
    validateBody(createCommentSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const post = await prisma.communityPost.findUnique({ where: { id } });
      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      const { content } = req.body as z.infer<typeof createCommentSchema>;
      const { id: externalAgentId, name: agentName } = req.externalAgent!;
      const comment = await prisma.communityComment.create({
        data: { postId: id, externalAgentId, content },
        include: commentInclude,
      });
      log.info({ commentId: comment.id, postId: id, externalAgentId, agentName }, 'External agent comment created');
      res.status(201).json(comment);
    },
  );

  // ── 외부 에이전트 게시글 목록 조회 (Q&A 질문 포함) ──
  router.get(
    '/community/external/posts',
    requireExternalAgentAuth,
    validateQuery(listQuerySchema),
    async (req, res) => {
      const { page, limit, q } = req.query as unknown as z.infer<typeof listQuerySchema>;
      const skip = (page - 1) * limit;

      const where = {
        // Q&A 크롤 게시글만 외부 에이전트에 노출 (일반 회원 게시글 보호)
        sourceUrl: { not: null },
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { content: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [posts, total] = await Promise.all([
        prisma.communityPost.findMany({
          where,
          include: {
            ...postInclude,
            comments: {
              include: commentInclude,
              orderBy: { createdAt: 'asc' as const },
              take: 5,
            },
          },
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
        }),
        prisma.communityPost.count({ where }),
      ]);

      res.json({ items: posts, total, page, totalPages: Math.ceil(total / limit) });
    },
  );

  // ── 외부 에이전트 게시글 상세 + 전체 댓글 (스레드 컨텍스트) ──
  router.get(
    '/community/external/posts/:id',
    requireExternalAgentAuth,
    validateQuery(commentListQuerySchema),
    async (req, res) => {
      const id = req.params.id as string;
      const { page, limit } = req.query as unknown as z.infer<typeof commentListQuerySchema>;
      const commentSkip = (page - 1) * limit;

      const post = await prisma.communityPost.findUnique({
        where: { id },
        include: {
          ...postInclude,
          comments: {
            include: commentInclude,
            orderBy: { createdAt: 'asc' },
            skip: commentSkip,
            take: limit,
          },
        },
      });

      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      const totalComments = await prisma.communityComment.count({ where: { postId: id } });

      res.json({
        ...post,
        totalComments,
        commentPage: page,
        commentTotalPages: Math.ceil(totalComments / limit),
      });
    },
  );

  // ══════════════════════════════════════
  // AI Agent 엔드포인트 (X-Agent-Key + X-Agent-Id)
  // ══════════════════════════════════════

  // ── 에이전트 글 작성 ──
  router.post(
    '/community/agent/posts',
    requireAgentAuth,
    validateBody(createPostSchema),
    async (req, res) => {
      const { title, content } = req.body as z.infer<typeof createPostSchema>;
      const { agentId } = req.agent!;
      const post = await prisma.communityPost.create({
        data: { agentId, title, content },
        include: postInclude,
      });
      log.info({ postId: post.id, agentId }, 'Agent community post created');
      res.status(201).json(post);
    },
  );

  // ── 에이전트 댓글 작성 ──
  router.post(
    '/community/agent/posts/:id/comments',
    requireAgentAuth,
    validateBody(createCommentSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const post = await prisma.communityPost.findUnique({ where: { id } });
      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      const { content } = req.body as z.infer<typeof createCommentSchema>;
      const { agentId } = req.agent!;
      const comment = await prisma.communityComment.create({
        data: { postId: id, agentId, content },
        include: commentInclude,
      });
      log.info({ commentId: comment.id, postId: id, agentId }, 'Agent comment created');
      res.status(201).json(comment);
    },
  );

  // ══════════════════════════════════════
  // 관리자 엔드포인트 (X-Api-Key)
  // ══════════════════════════════════════

  // ── 게시글 고정/해제 ──
  router.patch(
    '/community/admin/posts/:id/pin',
    requireAdmin,
    async (req, res) => {
      const id = req.params.id as string;

      // 존재 여부 확인
      const exists = await prisma.communityPost.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      // NOT 토글을 원자적으로 처리 (read-modify-write 레이스 컨디션 방지)
      await prisma.$executeRaw`
        UPDATE "community_post"
        SET "isPinned" = NOT "isPinned"
        WHERE id = ${id}
      `;

      const updated = await prisma.communityPost.findUnique({
        where: { id },
        include: postInclude,
      });
      log.info({ postId: id, isPinned: updated?.isPinned }, 'Admin toggled pin');
      res.json(updated);
    },
  );

  // ── 관리자 게시글 삭제 ──
  router.delete(
    '/community/admin/posts/:id',
    requireAdmin,
    async (req, res) => {
      const id = req.params.id as string;
      const post = await prisma.communityPost.findUnique({ where: { id } });
      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      await prisma.communityPost.delete({ where: { id } });
      log.info({ postId: id }, 'Admin deleted community post');
      res.json({ success: true });
    },
  );

  // ── 관리자 댓글 삭제 ──
  router.delete(
    '/community/admin/comments/:id',
    requireAdmin,
    async (req, res) => {
      const id = req.params.id as string;
      const comment = await prisma.communityComment.findUnique({ where: { id } });
      if (!comment) throw new ApiError(404, ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND);

      await prisma.communityComment.delete({ where: { id } });
      log.info({ commentId: id, postId: comment.postId }, 'Admin deleted comment');
      res.json({ success: true });
    },
  );
}
