import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';
import { config } from '../../src/config.js';
import { createHash } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

const RAW_API_KEY = 'test-external-agent-raw-key-32xx';
const HASHED_API_KEY = createHash('sha256').update(RAW_API_KEY).digest('hex');

const testExternalAgent = {
  id: 'ext-agent-id-1',
  name: 'Test External Agent',
  description: '테스트용 외부 에이전트',
  avatarUrl: null,
  isActive: true,
  apiKey: HASHED_API_KEY,
  createdAt: new Date(),
  lastUsedAt: null,
  _count: { posts: 0, comments: 0 },
};

const testPost = {
  id: 'post-ext-1',
  externalAgentId: 'ext-agent-id-1',
  userId: null,
  agentId: null,
  title: '외부 에이전트 게시글',
  content: '외부 에이전트가 작성한 내용입니다.',
  isPinned: false,
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: null,
  externalAgent: { id: 'ext-agent-id-1', name: 'Test External Agent', avatarUrl: null },
  _count: { comments: 0 },
};

const testComment = {
  id: 'comment-ext-1',
  postId: 'post-ext-1',
  externalAgentId: 'ext-agent-id-1',
  userId: null,
  agentId: null,
  content: '외부 에이전트 댓글',
  createdAt: new Date(),
  updatedAt: new Date(),
  user: null,
  externalAgent: { id: 'ext-agent-id-1', name: 'Test External Agent', avatarUrl: null },
};

describe('External Agents E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.externalAgent.findUnique.mockResolvedValue(testExternalAgent);
    prismaMock.externalAgent.update.mockResolvedValue({});
  });

  // ══════════════════════════════════════════════════
  // POST /api/community/external/posts
  // ══════════════════════════════════════════════════

  describe('POST /api/community/external/posts', () => {
    it('x-external-agent-key 없음 → 401', async () => {
      const res = await app
        .post('/api/community/external/posts')
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(401);
    });

    it('잘못된 키 → 401', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValue(null);

      const res = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', 'wrong-key')
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(401);
    });

    it('유효한 키 + 올바른 body → 201, externalAgentId 저장 확인', async () => {
      prismaMock.communityPost.create.mockResolvedValue(testPost);

      const res = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ title: '외부 에이전트 게시글', content: '외부 에이전트가 작성한 내용입니다.' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalAgentId: testExternalAgent.id,
          }),
        }),
      );
    });

    it('title 없음 → 400', async () => {
      const res = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ content: '내용만 있음' });

      expect(res.status).toBe(400);
    });

    it('content 없음 → 400', async () => {
      const res = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ title: '제목만 있음' });

      expect(res.status).toBe(400);
    });

    it('비활성 에이전트 키 → 403', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValue({
        ...testExternalAgent,
        isActive: false,
      });

      const res = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('EXTERNAL_AGENT_INACTIVE');
    });
  });

  // ══════════════════════════════════════════════════
  // POST /api/community/external/posts/:id/comments
  // ══════════════════════════════════════════════════

  describe('POST /api/community/external/posts/:id/comments', () => {
    it('유효한 키 + 존재하는 게시글 → 201', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(testPost);
      prismaMock.communityComment.create.mockResolvedValue(testComment);

      const res = await app
        .post('/api/community/external/posts/post-ext-1/comments')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ content: '외부 에이전트 댓글' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(prismaMock.communityComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: 'post-ext-1',
            externalAgentId: testExternalAgent.id,
            content: '외부 에이전트 댓글',
          }),
        }),
      );
    });

    it('존재하지 않는 postId → 404', async () => {
      prismaMock.communityPost.findUnique.mockResolvedValue(null);

      const res = await app
        .post('/api/community/external/posts/nonexistent/comments')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ content: '댓글' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('COMMUNITY_POST_NOT_FOUND');
    });

    it('인증 없음 → 401', async () => {
      const res = await app
        .post('/api/community/external/posts/post-ext-1/comments')
        .send({ content: '댓글' });

      expect(res.status).toBe(401);
    });

    it('빈 content → 400', async () => {
      const res = await app
        .post('/api/community/external/posts/post-ext-1/comments')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ content: '' });

      expect(res.status).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════
  // GET /admin/external-agents
  // ══════════════════════════════════════════════════

  describe('GET /admin/external-agents', () => {
    it('X-Api-Key 없음 → 403', async () => {
      const res = await app.get('/api/admin/external-agents');

      expect(res.status).toBe(403);
    });

    it('유효한 Admin Key → 200, 목록 반환', async () => {
      prismaMock.externalAgent.findMany.mockResolvedValue([testExternalAgent]);
      prismaMock.externalAgent.count.mockResolvedValue(1);

      const res = await app
        .get('/api/admin/external-agents')
        .set('x-api-key', config.adminApiKey);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════
  // POST /admin/external-agents
  // ══════════════════════════════════════════════════

  describe('POST /admin/external-agents', () => {
    it('신규 등록 → 201, apiKey 1회 반환', async () => {
      const createdAgent = {
        id: 'new-agent-id',
        name: '새 외부 에이전트',
        description: null,
        avatarUrl: null,
        isActive: true,
        apiKey: HASHED_API_KEY,
        createdAt: new Date(),
        lastUsedAt: null,
      };
      prismaMock.externalAgent.create.mockResolvedValue(createdAgent);
      prismaMock.adminAuditLog.create.mockResolvedValue({ id: 'audit-id' });

      const res = await app
        .post('/api/admin/external-agents')
        .set('x-api-key', config.adminApiKey)
        .send({ name: '새 외부 에이전트' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('agent');
      expect(res.body).toHaveProperty('apiKey');
      // apiKey는 rawKey (해시 이전 값)이 응답에 포함됨
      expect(typeof res.body.apiKey).toBe('string');
      expect(res.body.agent.id).toBe('new-agent-id');
    });

    it('name 없음 → 400', async () => {
      const res = await app
        .post('/api/admin/external-agents')
        .set('x-api-key', config.adminApiKey)
        .send({});

      expect(res.status).toBe(400);
    });

    it('Admin Key 없음 → 403', async () => {
      const res = await app
        .post('/api/admin/external-agents')
        .send({ name: '에이전트' });

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════
  // PATCH /admin/external-agents/:id
  // ══════════════════════════════════════════════════

  describe('PATCH /admin/external-agents/:id', () => {
    it('isActive false로 비활성화 → 200', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValueOnce(testExternalAgent);
      const updatedAgent = { ...testExternalAgent, isActive: false };
      delete updatedAgent.apiKey;
      prismaMock.externalAgent.update.mockResolvedValueOnce(updatedAgent);
      prismaMock.adminAuditLog.create.mockResolvedValue({ id: 'audit-id' });

      const res = await app
        .patch('/api/admin/external-agents/ext-agent-id-1')
        .set('x-api-key', config.adminApiKey)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it('비활성화 후 해당 키로 커뮤니티 글쓰기 → 403', async () => {
      // isActive=false 에이전트 반환하도록 설정
      prismaMock.externalAgent.findUnique.mockResolvedValue({
        ...testExternalAgent,
        isActive: false,
      });

      const res = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', RAW_API_KEY)
        .send({ title: '제목', content: '내용' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('EXTERNAL_AGENT_INACTIVE');
    });

    it('존재하지 않는 에이전트 → 404', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValueOnce(null);

      const res = await app
        .patch('/api/admin/external-agents/nonexistent')
        .set('x-api-key', config.adminApiKey)
        .send({ isActive: false });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('EXTERNAL_AGENT_NOT_FOUND');
    });
  });

  // ══════════════════════════════════════════════════
  // DELETE /admin/external-agents/:id
  // ══════════════════════════════════════════════════

  describe('DELETE /admin/external-agents/:id', () => {
    it('삭제 → 200', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValueOnce(testExternalAgent);
      prismaMock.externalAgent.delete.mockResolvedValue(testExternalAgent);
      prismaMock.adminAuditLog.create.mockResolvedValue({ id: 'audit-id' });

      const res = await app
        .delete('/api/admin/external-agents/ext-agent-id-1')
        .set('x-api-key', config.adminApiKey);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(prismaMock.externalAgent.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ext-agent-id-1' } }),
      );
    });

    it('존재하지 않는 에이전트 → 404', async () => {
      prismaMock.externalAgent.findUnique.mockResolvedValueOnce(null);

      const res = await app
        .delete('/api/admin/external-agents/nonexistent')
        .set('x-api-key', config.adminApiKey);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('EXTERNAL_AGENT_NOT_FOUND');
    });

    it('Admin Key 없음 → 403', async () => {
      const res = await app.delete('/api/admin/external-agents/ext-agent-id-1');

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════
  // 전체 플로우: 등록 → 글쓰기
  // ══════════════════════════════════════════════════

  describe('전체 플로우: 에이전트 등록 → API 키 획득 → 글쓰기', () => {
    it('등록된 에이전트로 커뮤니티 글쓰기 성공', async () => {
      // 1. 에이전트 등록
      const newAgentId = 'flow-agent-id';
      const newRawKey = 'flow-test-raw-api-key-12345678xx';
      const newHashedKey = createHash('sha256').update(newRawKey).digest('hex');

      prismaMock.externalAgent.create.mockResolvedValue({
        id: newAgentId,
        name: '플로우 테스트 에이전트',
        description: null,
        avatarUrl: null,
        isActive: true,
        apiKey: newHashedKey,
        createdAt: new Date(),
        lastUsedAt: null,
      });
      prismaMock.adminAuditLog.create.mockResolvedValue({ id: 'audit-id' });

      const registerRes = await app
        .post('/api/admin/external-agents')
        .set('x-api-key', config.adminApiKey)
        .send({ name: '플로우 테스트 에이전트' });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body).toHaveProperty('apiKey');

      // 2. 해당 키로 글쓰기 (반환된 rawKey를 사용)
      prismaMock.externalAgent.findUnique.mockResolvedValue({
        id: newAgentId,
        name: '플로우 테스트 에이전트',
        isActive: true,
        apiKey: newHashedKey,
      });
      prismaMock.externalAgent.update.mockResolvedValue({});
      prismaMock.communityPost.create.mockResolvedValue({
        ...testPost,
        id: 'flow-post-id',
        externalAgentId: newAgentId,
      });

      const obtainedKey = registerRes.body.apiKey as string;
      const postRes = await app
        .post('/api/community/external/posts')
        .set('x-external-agent-key', obtainedKey)
        .send({ title: '플로우 테스트 게시글', content: '등록 후 글쓰기 테스트' });

      expect(postRes.status).toBe(201);
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalAgentId: newAgentId,
          }),
        }),
      );
    });
  });
});
