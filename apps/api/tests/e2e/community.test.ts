import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';
import { config } from '../../src/config.js';

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
      prismaMock.communityPost.updateMany.mockResolvedValue({ count: 1 });
      // updateMany 후 findUnique로 다시 조회
      prismaMock.communityPost.findUnique
        .mockResolvedValueOnce(testPost) // 소유권 확인용
        .mockResolvedValueOnce({ ...testPost, title: '수정된 제목' }); // 수정 후 조회

      const res = await app
        .patch('/api/community/posts/post-1')
        .set('Authorization', authHeader())
        .send({ title: '수정된 제목' });

      expect(res.status).toBe(200);
      expect(prismaMock.communityPost.updateMany).toHaveBeenCalled();
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
      prismaMock.communityPost.deleteMany.mockResolvedValue({ count: 1 });

      const res = await app
        .delete('/api/community/posts/post-1')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('타인 게시글 삭제 → 403', async () => {
      // deleteMany가 0 반환 (userId 불일치) → findUnique로 존재 확인 → 403
      prismaMock.communityPost.deleteMany.mockResolvedValue({ count: 0 });
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
      prismaMock.communityComment.deleteMany.mockResolvedValue({ count: 1 });

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

  // ── 검색 ──
  describe('GET /api/community/posts?q=', () => {
    it('검색어로 필터링', async () => {
      prismaMock.communityPost.findMany.mockResolvedValue([testPost]);
      prismaMock.communityPost.count.mockResolvedValue(1);

      const res = await app.get('/api/community/posts?q=테스트');

      expect(res.status).toBe(200);
      expect(prismaMock.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ title: { contains: '테스트', mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });
  });

  // ── AI Agent 엔드포인트 ──
  describe('POST /api/community/agent/posts', () => {
    const agentHeaders = {
      'x-agent-key': config.agentKeys['image-matching'],
      'x-agent-id': 'image-matching',
    };

    it('유효한 에이전트 인증 → 201', async () => {
      prismaMock.communityPost.create.mockResolvedValue({
        ...testPost,
        userId: null,
        agentId: 'image-matching',
      });

      const res = await app
        .post('/api/community/agent/posts')
        .set(agentHeaders)
        .send({ title: 'AI 분석 리포트', content: '오늘의 매칭 결과입니다.' });

      expect(res.status).toBe(201);
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'image-matching',
            title: 'AI 분석 리포트',
          }),
        }),
      );
    });

    it('에이전트 키 없음 → 403', async () => {
      const res = await app
        .post('/api/community/agent/posts')
        .set({ 'x-agent-id': 'image-matching' })
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AGENT_AUTH_REQUIRED');
    });

    it('다른 에이전트 키 사용 → 403', async () => {
      const res = await app
        .post('/api/community/agent/posts')
        .set({ 'x-agent-key': config.agentKeys['promotion'], 'x-agent-id': 'image-matching' })
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AGENT_AUTH_REQUIRED');
    });

    it('잘못된 에이전트 ID → 400', async () => {
      const res = await app
        .post('/api/community/agent/posts')
        .set({ 'x-agent-key': 'some-key', 'x-agent-id': 'invalid-agent' })
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('AGENT_INVALID_ID');
    });
  });

  describe('POST /api/community/agent/posts/:id/comments', () => {
    it('에이전트 댓글 작성 → 201', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.communityComment.create.mockResolvedValue({
        ...testComment,
        userId: null,
        agentId: 'promotion',
      });

      const res = await app
        .post('/api/community/agent/posts/post-1/comments')
        .set({ 'x-agent-key': config.agentKeys['promotion'], 'x-agent-id': 'promotion' })
        .send({ content: 'AI 댓글입니다.' });

      expect(res.status).toBe(201);
      expect(prismaMock.communityComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'promotion',
            postId: 'post-1',
          }),
        }),
      );
    });
  });

  // ── 관리자 엔드포인트 ──
  describe('PATCH /api/community/admin/posts/:id/pin', () => {
    it('관리자 → 고정 토글', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.$executeRaw.mockResolvedValue(1);
      // $executeRaw 후 findUnique로 다시 조회
      prismaMock.communityPost.findUnique
        .mockResolvedValueOnce(testPost) // 존재 확인
        .mockResolvedValueOnce({ ...testPost, isPinned: true }); // 토글 후 조회

      const res = await app
        .patch('/api/community/admin/posts/post-1/pin')
        .set('x-api-key', config.adminApiKey);

      expect(res.status).toBe(200);
      expect(res.body.isPinned).toBe(true);
    });

    it('비관리자 → 403', async () => {
      const res = await app.patch('/api/community/admin/posts/post-1/pin');
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/community/admin/posts/:id', () => {
    it('관리자 → 삭제 성공', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.communityPost.delete.mockResolvedValue(testPost);

      const res = await app
        .delete('/api/community/admin/posts/post-1')
        .set('x-api-key', config.adminApiKey);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe('DELETE /api/community/admin/comments/:id', () => {
    it('관리자 → 댓글 삭제 성공', async () => {
      prismaMock.communityComment.findUnique.mockResolvedValue(testComment);
      prismaMock.communityComment.delete.mockResolvedValue(testComment);

      const res = await app
        .delete('/api/community/admin/comments/comment-1')
        .set('x-api-key', config.adminApiKey);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });
});
