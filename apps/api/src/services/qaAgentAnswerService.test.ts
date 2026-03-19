import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma mock
vi.mock('../db/client.js', () => ({
  prisma: {
    communityComment: {
      create: vi.fn().mockResolvedValue({ id: 'comment-1' }),
    },
  },
}));

// AI mock
vi.mock('../ai/aiClient.js', () => ({
  askClaude: vi.fn().mockResolvedValue('이것은 충분히 긴 AI 답변 텍스트입니다.'),
}));

// logger mock
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { prisma } from '../db/client.js';
import { askClaude } from '../ai/aiClient.js';
import { answerQuestionWithAgents } from './qaAgentAnswerService.js';

const prismaMock = prisma as unknown as {
  communityComment: {
    create: ReturnType<typeof vi.fn>;
  };
};
const askClaudeMock = askClaude as ReturnType<typeof vi.fn>;

describe('answerQuestionWithAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    askClaudeMock.mockResolvedValue('이것은 충분히 긴 AI 답변 텍스트입니다.');
    prismaMock.communityComment.create.mockResolvedValue({ id: 'comment-1' });
  });

  describe('정상 답변', () => {
    it('2개 내부 에이전트(chatbot-alert, image-matching) 모두 댓글 생성', async () => {
      await answerQuestionWithAgents('post-1', '강아지 잃어버렸을 때 어떻게 하나요?', '상세 내용');

      // chatbot-alert + image-matching 2개 에이전트
      expect(prismaMock.communityComment.create).toHaveBeenCalledTimes(2);
    });

    it('create 호출 시 postId 포함', async () => {
      await answerQuestionWithAgents('post-abc', '제목', '내용');

      const calls = prismaMock.communityComment.create.mock.calls as Array<[{ data: { postId: string; agentId: string; content: string } }]>;
      expect(calls.every(([arg]) => arg.data.postId === 'post-abc')).toBe(true);
    });

    it('chatbot-alert agentId로 create 호출됨', async () => {
      await answerQuestionWithAgents('post-1', '제목', '내용');

      const agentIds = (prismaMock.communityComment.create.mock.calls as Array<[{ data: { agentId: string } }]>)
        .map(([arg]) => arg.data.agentId);
      expect(agentIds).toContain('chatbot-alert');
    });

    it('image-matching agentId로 create 호출됨', async () => {
      await answerQuestionWithAgents('post-1', '제목', '내용');

      const agentIds = (prismaMock.communityComment.create.mock.calls as Array<[{ data: { agentId: string } }]>)
        .map(([arg]) => arg.data.agentId);
      expect(agentIds).toContain('image-matching');
    });
  });

  describe('병렬 처리 — Promise.allSettled', () => {
    it('한 에이전트 AI 호출 실패해도 다른 에이전트는 댓글 생성', async () => {
      askClaudeMock
        .mockRejectedValueOnce(new Error('AI 오류'))         // 첫 번째 에이전트 실패
        .mockResolvedValueOnce('두 번째 에이전트 답변입니다.'); // 두 번째 에이전트 성공

      await answerQuestionWithAgents('post-1', '제목', '내용');

      // 한 개는 실패, 한 개는 성공 → create 1번만 호출
      expect(prismaMock.communityComment.create).toHaveBeenCalledTimes(1);
    });

    it('한 에이전트 prisma 실패해도 전체 함수 throw 없이 완료', async () => {
      prismaMock.communityComment.create
        .mockRejectedValueOnce(new Error('DB 오류'))
        .mockResolvedValueOnce({ id: 'comment-2' });

      await expect(
        answerQuestionWithAgents('post-1', '제목', '내용'),
      ).resolves.toBeUndefined();
    });
  });

  describe('짧은 답변 스킵', () => {
    it('9자 미만 응답 → create 미호출', async () => {
      askClaudeMock.mockResolvedValue('짧음');  // 3자

      await answerQuestionWithAgents('post-1', '제목', '내용');

      expect(prismaMock.communityComment.create).not.toHaveBeenCalled();
    });

    it('정확히 9자 → create 미호출 (10자 미만 기준)', async () => {
      askClaudeMock.mockResolvedValue('123456789');  // 9자

      await answerQuestionWithAgents('post-1', '제목', '내용');

      expect(prismaMock.communityComment.create).not.toHaveBeenCalled();
    });

    it('정확히 10자 → create 호출됨', async () => {
      askClaudeMock.mockResolvedValue('1234567890');  // 10자

      await answerQuestionWithAgents('post-1', '제목', '내용');

      expect(prismaMock.communityComment.create).toHaveBeenCalled();
    });

    it('빈 문자열 응답 → create 미호출', async () => {
      askClaudeMock.mockResolvedValue('');

      await answerQuestionWithAgents('post-1', '제목', '내용');

      expect(prismaMock.communityComment.create).not.toHaveBeenCalled();
    });

    it('null/undefined 응답 → create 미호출', async () => {
      askClaudeMock.mockResolvedValue(null);

      await answerQuestionWithAgents('post-1', '제목', '내용');

      expect(prismaMock.communityComment.create).not.toHaveBeenCalled();
    });
  });

  describe('content truncation', () => {
    it('userMessage에 content가 2000자로 잘려서 AI에 전달됨', async () => {
      const longContent = 'C'.repeat(3000);

      await answerQuestionWithAgents('post-1', '제목', longContent);

      const firstCallArgs = askClaudeMock.mock.calls[0] as [string, string, unknown];
      const userMessage = firstCallArgs[1];
      // content.slice(0, 2000) → 'C'.repeat(2000)이 userMessage에 포함되어야 함
      expect(userMessage).toContain('C'.repeat(2000));
      expect(userMessage).not.toContain('C'.repeat(2001));
    });

    it('AI 답변이 2000자 초과 시 2000자로 잘려서 저장', async () => {
      const longAnswer = 'A'.repeat(3000);
      askClaudeMock.mockResolvedValue(longAnswer);

      await answerQuestionWithAgents('post-1', '제목', '내용');

      const createCalls = prismaMock.communityComment.create.mock.calls as Array<[{ data: { content: string } }]>;
      createCalls.forEach(([arg]) => {
        expect(arg.data.content).toHaveLength(2000);
        expect(arg.data.content).toBe('A'.repeat(2000));
      });
    });
  });

  describe('AI 실패 처리', () => {
    it('askClaude 에러 시 throw 없이 처리 (로그만)', async () => {
      askClaudeMock.mockRejectedValue(new Error('Claude API 오류'));

      await expect(
        answerQuestionWithAgents('post-1', '제목', '내용'),
      ).resolves.toBeUndefined();
    });

    it('askClaude 에러 시 create 미호출', async () => {
      askClaudeMock.mockRejectedValue(new Error('Claude API 오류'));

      await answerQuestionWithAgents('post-1', '제목', '내용');

      expect(prismaMock.communityComment.create).not.toHaveBeenCalled();
    });
  });

  describe('prisma 실패 처리', () => {
    it('create 에러 시 throw 없이 처리', async () => {
      prismaMock.communityComment.create.mockRejectedValue(new Error('DB 연결 오류'));

      await expect(
        answerQuestionWithAgents('post-1', '제목', '내용'),
      ).resolves.toBeUndefined();
    });
  });

  describe('agentId 옵션 전달', () => {
    it('askClaude 호출 시 agentId 옵션 포함', async () => {
      await answerQuestionWithAgents('post-1', '제목', '내용');

      const calls = askClaudeMock.mock.calls as Array<[string, string, { maxTokens: number; agentId: string }]>;
      const agentIds = calls.map(([, , opts]) => opts.agentId);
      expect(agentIds).toContain('chatbot-alert');
      expect(agentIds).toContain('image-matching');
    });
  });
});
