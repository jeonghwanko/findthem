import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postHeimi, postClaude, postAli } from './communityAgentService.js';

// prisma mock
vi.mock('../db/client.js', () => ({
  prisma: {
    communityPost: {
      create: vi.fn().mockResolvedValue({ id: 'test-post-id' }),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

// AI mock
vi.mock('../ai/aiClient.js', () => ({
  askClaude: vi.fn().mockResolvedValue('AI generated content'),
}));

// logger mock
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// 각 mock import
import { prisma } from '../db/client.js';
import { askClaude } from '../ai/aiClient.js';

const prismaMock = prisma as unknown as {
  communityPost: {
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};
const askClaudeMock = askClaude as ReturnType<typeof vi.fn>;

describe('communityAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.communityPost.create.mockResolvedValue({ id: 'test-post-id' });
    prismaMock.communityPost.count.mockResolvedValue(0);
    askClaudeMock.mockResolvedValue('AI generated content');
  });

  // ── postHeimi ──────────────────────────────────────────────────────────────

  describe('postHeimi', () => {
    it('정상: prisma.communityPost.create 호출, agentId=promotion', async () => {
      await postHeimi('초코', '홍보팀', 'EMAIL', 'DOG');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'promotion',
          }),
        }),
      );
    });

    it('AI 실패 시 fallback 텍스트로 게시', async () => {
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postHeimi('초코', '홍보팀', 'EMAIL', 'DOG');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      // fallback 텍스트에는 reportName이 포함됨
      expect(callArg.data.content).toContain('초코');
    });

    it('prisma 실패 시 에러 throw 없이 처리됨', async () => {
      prismaMock.communityPost.create.mockRejectedValue(new Error('DB error'));

      // throw 없이 정상 완료되어야 함
      await expect(postHeimi('초코', '홍보팀', 'EMAIL', 'DOG')).resolves.toBeUndefined();
    });

    it('channel=YOUTUBE_COMMENT 시 YouTube 댓글 레이블 포함', async () => {
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postHeimi('뽀삐', 'YouTuber', 'YOUTUBE_COMMENT', 'CAT');

      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      expect(callArg.data.content).toContain('YouTube 댓글');
    });

    it('subjectType PERSON → 사람 레이블', async () => {
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postHeimi('홍길동', '기자', 'EMAIL', 'PERSON');

      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      expect(callArg.data.content).toContain('사람');
    });
  });

  // ── postClaude ─────────────────────────────────────────────────────────────

  describe('postClaude', () => {
    it('정상: agentId=image-matching으로 create 호출', async () => {
      await postClaude('초코', 0.9, '서울시 강남구', 'DOG');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'image-matching',
          }),
        }),
      );
    });

    it('confidence 0.85 → 제목에 "85%" 포함', async () => {
      await postClaude('초코', 0.85, '서울시 강남구', 'DOG');

      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      expect(callArg.data.title).toContain('85%');
    });

    it('당일 중복 방지: count=1 반환 시 create 미호출', async () => {
      prismaMock.communityPost.count.mockResolvedValue(1);

      await postClaude('초코', 0.9, '서울시 강남구', 'DOG');

      expect(prismaMock.communityPost.create).not.toHaveBeenCalled();
    });

    it('count=0이면 create 호출', async () => {
      prismaMock.communityPost.count.mockResolvedValue(0);

      await postClaude('바둑이', 0.75, '부산시 해운대구', 'DOG');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
    });

    it('AI 실패 시 fallback 텍스트로 게시', async () => {
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postClaude('초코', 0.7, '서울시 마포구', 'CAT');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      expect(callArg.data.content).toContain('초코');
    });

    it('prisma 실패 시 에러 throw 없이 처리됨', async () => {
      prismaMock.communityPost.create.mockRejectedValue(new Error('DB error'));

      await expect(postClaude('초코', 0.9, '서울', 'DOG')).resolves.toBeUndefined();
    });
  });

  // ── postAli ────────────────────────────────────────────────────────────────

  describe('postAli', () => {
    it('정상: agentId=chatbot-alert으로 create 호출', async () => {
      await postAli('초코', 'DOG', '서울시 강남구');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'chatbot-alert',
          }),
        }),
      );
    });

    it('reportName 50자 초과 시 safeName으로 잘림 확인', async () => {
      const longName = 'a'.repeat(60);
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postAli(longName, 'DOG', '서울시');

      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      // title에 포함된 이름이 50자 이하여야 함
      const titleMatch = callArg.data.title.match(/'([^']+)'/);
      expect(titleMatch).not.toBeNull();
      expect(titleMatch![1].length).toBeLessThanOrEqual(50);
    });

    it('subjectType CAT → 고양이 레이블 포함', async () => {
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postAli('나비', 'CAT', '인천시');

      const callArg = prismaMock.communityPost.create.mock.calls[0][0];
      expect(callArg.data.content).toContain('고양이');
    });

    it('AI 실패 시 fallback으로 게시', async () => {
      askClaudeMock.mockRejectedValue(new Error('AI unavailable'));

      await postAli('초코', 'DOG', '서울시 강남구');

      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
    });

    it('prisma 실패 시 에러 throw 없이 처리됨', async () => {
      prismaMock.communityPost.create.mockRejectedValue(new Error('DB error'));

      await expect(postAli('초코', 'DOG', '서울')).resolves.toBeUndefined();
    });
  });
});
