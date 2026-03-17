import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth, optionalAuth, requireAgentAuth, requireAdmin, requireExternalAgentAuth } from '../middlewares/auth.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { ApiError } from '../middlewares/errors.js';
import { ERROR_CODES } from '@findthem/shared';
import { createLogger } from '../logger.js';

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
  limit: z.coerce.number().int().min(1).max(50).default(20),
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
      const post = await prisma.communityPost.findUnique({
        where: { id },
      });
      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);
      if (post.userId !== req.user!.userId) {
        throw new ApiError(403, ERROR_CODES.COMMUNITY_POST_OWNER_ONLY);
      }

      const { title, content } = req.body as z.infer<typeof updatePostSchema>;
      const updated = await prisma.communityPost.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
        },
        include: postInclude,
      });
      res.json(updated);
    },
  );

  // ── 게시글 삭제 (댓글은 onDelete: Cascade로 자동 삭제) ──
  router.delete('/community/posts/:id', requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const post = await prisma.communityPost.findUnique({
      where: { id },
    });
    if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);
    if (post.userId !== req.user!.userId) {
      throw new ApiError(403, ERROR_CODES.COMMUNITY_POST_OWNER_ONLY);
    }

    await prisma.communityPost.delete({ where: { id } });
    log.info({ postId: id, userId: req.user!.userId }, 'Community post deleted');
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
      res.status(201).json(comment);
    },
  );

  // ── 댓글 삭제 ──
  router.delete(
    '/community/comments/:id',
    requireAuth,
    async (req, res) => {
      const id = req.params.id as string;
      const comment = await prisma.communityComment.findUnique({
        where: { id },
      });
      if (!comment) {
        throw new ApiError(404, ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND);
      }
      if (comment.userId !== req.user!.userId) {
        throw new ApiError(403, ERROR_CODES.COMMUNITY_COMMENT_OWNER_ONLY);
      }

      await prisma.communityComment.delete({ where: { id } });
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
      const post = await prisma.communityPost.findUnique({ where: { id } });
      if (!post) throw new ApiError(404, ERROR_CODES.COMMUNITY_POST_NOT_FOUND);

      const updated = await prisma.communityPost.update({
        where: { id },
        data: { isPinned: !post.isPinned },
        include: postInclude,
      });
      log.info({ postId: id, isPinned: updated.isPinned }, 'Admin toggled pin');
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
