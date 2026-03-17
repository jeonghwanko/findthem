import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

const testPost = {
  id: 'post-1',
  userId: 'test-user-id',
  agentId: null,
  title: '테스트 게시글',
  content: '테스트 내용입니다.',
  isPinned: false,
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'test-user-id', name: '테스트 유저' },
  _count: { comments: 0 },
};

const testComment = {
  id: 'comment-1',
  postId: 'post-1',
  userId: 'test-user-id',
  agentId: null,
  content: '테스트 댓글',
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'test-user-id', name: '테스트 유저' },
};

describe('Community E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
  });

  // ── GET /api/community/posts ──
  describe('GET /api/community/posts', () => {
    it('비인증도 접근 가능 → 200', async () => {
      prismaMock.communityPost.findMany.mockResolvedValue([testPost]);
      prismaMock.communityPost.count.mockResolvedValue(1);

      const res = await app.get('/api/community/posts');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('totalPages');
      expect(res.body.items).toHaveLength(1);
    });

    it('페이지네이션 파라미터 적용', async () => {
      prismaMock.communityPost.findMany.mockResolvedValue([]);
      prismaMock.communityPost.count.mockResolvedValue(0);

      const res = await app.get('/api/community/posts?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(prismaMock.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('고정글 우선 정렬', async () => {
      prismaMock.communityPost.findMany.mockResolvedValue([]);
      prismaMock.communityPost.count.mockResolvedValue(0);

      await app.get('/api/community/posts');

      expect(prismaMock.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });
  });

  // ── GET /api/community/posts/:id ──
  describe('GET /api/community/posts/:id', () => {
    it('존재하는 게시글 → 200 + 조회수 증가', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue({
        ...testPost,
        comments: [],
      });
      prismaMock.communityPost.update.mockResolvedValue(testPost);

      const res = await app.get('/api/community/posts/post-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('post-1');
      expect(prismaMock.communityPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { viewCount: { increment: 1 } },
        }),
      );
    });

    it('존재하지 않는 게시글 → 404', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(null);

      const res = await app.get('/api/community/posts/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('COMMUNITY_POST_NOT_FOUND');
    });
  });

  // ── POST /api/community/posts ──
  describe('POST /api/community/posts', () => {
    it('비인증 → 401', async () => {
      const res = await app
        .post('/api/community/posts')
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(401);
    });

    it('인증 + 유효한 데이터 → 201', async () => {
      prismaMock.communityPost.create.mockResolvedValue(testPost);

      const res = await app
        .post('/api/community/posts')
        .set('Authorization', authHeader())
        .send({ title: '테스트 게시글', content: '테스트 내용입니다.' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'test-user-id',
            title: '테스트 게시글',
            content: '테스트 내용입니다.',
          }),
        }),
      );
    });

    it('빈 제목 → 400', async () => {
      const res = await app
        .post('/api/community/posts')
        .set('Authorization', authHeader())
        .send({ title: '', content: '내용' });

      expect(res.status).toBe(400);
    });

    it('빈 내용 → 400', async () => {
      const res = await app
        .post('/api/community/posts')
        .set('Authorization', authHeader())
        .send({ title: '제목', content: '' });

      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /api/community/posts/:id ──
  describe('PATCH /api/community/posts/:id', () => {
    it('비인증 → 401', async () => {
      const res = await app
        .patch('/api/community/posts/post-1')
        .send({ title: '수정' });

      expect(res.status).toBe(401);
    });

    it('본인 게시글 수정 → 200', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.communityPost.update.mockResolvedValue({
        ...testPost,
        title: '수정된 제목',
      });

      const res = await app
        .patch('/api/community/posts/post-1')
        .set('Authorization', authHeader())
        .send({ title: '수정된 제목' });

      expect(res.status).toBe(200);
      expect(prismaMock.communityPost.update).toHaveBeenCalled();
    });

    it('타인 게시글 수정 → 403', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue({
        ...testPost,
        userId: 'other-user-id',
      });

      const res = await app
        .patch('/api/community/posts/post-1')
        .set('Authorization', authHeader())
        .send({ title: '수정' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('COMMUNITY_POST_OWNER_ONLY');
    });

    it('존재하지 않는 게시글 → 404', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(null);

      const res = await app
        .patch('/api/community/posts/nonexistent')
        .set('Authorization', authHeader())
        .send({ title: '수정' });

      expect(res.status).toBe(404);
    });

    it('빈 body → 400 (refine 검증)', async () => {
      const res = await app
        .patch('/api/community/posts/post-1')
        .set('Authorization', authHeader())
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/community/posts/:id ──
  describe('DELETE /api/community/posts/:id', () => {
    it('비인증 → 401', async () => {
      const res = await app.delete('/api/community/posts/post-1');
      expect(res.status).toBe(401);
    });

    it('본인 게시글 삭제 → 200', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.communityPost.delete.mockResolvedValue(testPost);

      const res = await app
        .delete('/api/community/posts/post-1')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('타인 게시글 삭제 → 403', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue({
        ...testPost,
        userId: 'other-user-id',
      });

      const res = await app
        .delete('/api/community/posts/post-1')
        .set('Authorization', authHeader());

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('COMMUNITY_POST_OWNER_ONLY');
    });
  });

  // ── POST /api/community/posts/:id/comments ──
  describe('POST /api/community/posts/:id/comments', () => {
    it('비인증 → 401', async () => {
      const res = await app
        .post('/api/community/posts/post-1/comments')
        .send({ content: '댓글' });

      expect(res.status).toBe(401);
    });

    it('인증 + 유효한 댓글 → 201', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.communityComment.create.mockResolvedValue(testComment);

      const res = await app
        .post('/api/community/posts/post-1/comments')
        .set('Authorization', authHeader())
        .send({ content: '테스트 댓글' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prismaMock.communityComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: 'post-1',
            userId: 'test-user-id',
            content: '테스트 댓글',
          }),
        }),
      );
    });

    it('존재하지 않는 게시글에 댓글 → 404', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(null);

      const res = await app
        .post('/api/community/posts/nonexistent/comments')
        .set('Authorization', authHeader())
        .send({ content: '댓글' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('COMMUNITY_POST_NOT_FOUND');
    });

    it('빈 댓글 → 400', async () => {
      const res = await app
        .post('/api/community/posts/post-1/comments')
        .set('Authorization', authHeader())
        .send({ content: '' });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/community/comments/:id ──
  describe('DELETE /api/community/comments/:id', () => {
    it('비인증 → 401', async () => {
      const res = await app.delete('/api/community/comments/comment-1');
      expect(res.status).toBe(401);
    });

    it('본인 댓글 삭제 → 200', async () => {
      prismaMock.communityComment.findUnique.mockResolvedValue(testComment);
      prismaMock.communityComment.delete.mockResolvedValue(testComment);

      const res = await app
        .delete('/api/community/comments/comment-1')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('타인 댓글 삭제 → 403', async () => {
      prismaMock.communityComment.findUnique.mockResolvedValue({
        ...testComment,
        userId: 'other-user-id',
      });

      const res = await app
        .delete('/api/community/comments/comment-1')
        .set('Authorization', authHeader());

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('COMMUNITY_COMMENT_OWNER_ONLY');
    });

    it('존재하지 않는 댓글 → 404', async () => {
      prismaMock.communityComment.findUnique.mockResolvedValue(null);

      const res = await app
        .delete('/api/community/comments/nonexistent')
        .set('Authorization', authHeader());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('COMMUNITY_COMMENT_NOT_FOUND');
    });
  });
});
