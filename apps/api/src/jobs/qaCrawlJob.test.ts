import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUEUE_NAMES } from '@findthem/shared';

// prisma mock
vi.mock('../db/client.js', () => ({
  prisma: {
    communityPost: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// queues mock — createWorker, qaCrawlQueue 등
vi.mock('./queues.js', () => ({
  createWorker: vi.fn(),
  qaCrawlQueue: {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  },
  QUEUE_NAMES: {
    QA_CRAWL: QUEUE_NAMES.QA_CRAWL,
  },
}));

// qaFetcherRegistry mock
vi.mock('./crawl/qa/qaFetcherRegistry.js', () => ({
  qaFetchers: [],
}));

// answerQuestionWithAgents mock
vi.mock('../services/qaAgentAnswerService.js', () => ({
  answerQuestionWithAgents: vi.fn().mockResolvedValue(undefined),
}));

// dispatchWebhookToAll mock
vi.mock('../services/webhookDispatcher.js', () => ({
  dispatchWebhookToAll: vi.fn().mockResolvedValue(undefined),
}));

// logger mock
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// @prisma/client mock — PrismaClientKnownRequestError
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();

  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    meta?: Record<string, unknown>;

    constructor(message: string, { code, clientVersion }: { code: string; clientVersion: string }) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = code;
      this.clientVersion = clientVersion;
    }
  }

  return {
    ...actual,
    Prisma: {
      ...(actual.Prisma ?? {}),
      PrismaClientKnownRequestError,
    },
  };
});

import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';
import { saveQuestion } from './qaCrawlJob.js';
import type { ExternalQuestion } from '@findthem/shared';

const prismaMock = prisma as unknown as {
  communityPost: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

// 테스트용 ExternalQuestion 헬퍼
function makeQuestion(overrides: Partial<ExternalQuestion> = {}): ExternalQuestion {
  return {
    externalId: 'kin-abc123',
    title: '강아지 잃어버렸을 때 어떻게 하나요',
    content: '어제 강아지가 실종됐는데 신고는 어디에 하나요 도와주세요',
    sourceUrl: 'https://kin.naver.com/qna/detail.nhn?docId=123',
    sourceName: 'naver-kin',
    postedAt: new Date('2026-03-15'),
    ...overrides,
  };
}

describe('qaCrawlJob — saveQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.communityPost.findFirst.mockResolvedValue(null);
    prismaMock.communityPost.create.mockResolvedValue({ id: 'post-new-1' });
  });

  describe('중복 체크', () => {
    it('deduplicationKey가 이미 존재하면 null 반환 (create 미호출)', async () => {
      prismaMock.communityPost.findFirst.mockResolvedValue({ id: 'post-existing-1' });

      const result = await saveQuestion(makeQuestion());

      expect(result).toBeNull();
      expect(prismaMock.communityPost.create).not.toHaveBeenCalled();
    });

    it('findFirst에 올바른 deduplicationKey 전달', async () => {
      prismaMock.communityPost.findFirst.mockResolvedValue({ id: 'existing' });

      const q = makeQuestion({ externalId: 'kin-xyz', sourceName: 'naver-kin' });
      await saveQuestion(q);

      expect(prismaMock.communityPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deduplicationKey: 'qa_naver-kin_kin-xyz' },
        }),
      );
    });

    it('deduplicationKey 형식: qa_{sourceName}_{externalId}', async () => {
      prismaMock.communityPost.findFirst.mockResolvedValue({ id: 'existing' });

      const q = makeQuestion({ externalId: 'my-ext-id', sourceName: 'my-source' });
      await saveQuestion(q);

      const call = prismaMock.communityPost.findFirst.mock.calls[0][0] as {
        where: { deduplicationKey: string };
      };
      expect(call.where.deduplicationKey).toBe('qa_my-source_my-ext-id');
    });
  });

  describe('정상 저장', () => {
    it('중복 없으면 create 호출 후 postId 반환', async () => {
      prismaMock.communityPost.create.mockResolvedValue({ id: 'post-new-1' });

      const result = await saveQuestion(makeQuestion());

      expect(result).toBe('post-new-1');
      expect(prismaMock.communityPost.create).toHaveBeenCalledOnce();
    });

    it('create에 deduplicationKey, title, content, sourceUrl 전달', async () => {
      const q = makeQuestion({
        title: '테스트 제목',
        content: '테스트 내용입니다.',
        sourceUrl: 'https://example.com/q/1',
        externalId: 'test-id',
        sourceName: 'test-source',
      });
      prismaMock.communityPost.create.mockResolvedValue({ id: 'post-result' });

      await saveQuestion(q);

      expect(prismaMock.communityPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: '테스트 제목',
            content: '테스트 내용입니다.',
            sourceUrl: 'https://example.com/q/1',
            deduplicationKey: 'qa_test-source_test-id',
          }),
        }),
      );
    });
  });

  describe('P2002 처리 — 레이스 컨디션', () => {
    it('PrismaClientKnownRequestError(P2002) 시 null 반환 (throw 없음)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`deduplicationKey`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      prismaMock.communityPost.create.mockRejectedValue(p2002);

      const result = await saveQuestion(makeQuestion());

      expect(result).toBeNull();
    });

    it('P2002 시 에러 throw 없이 완료', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      prismaMock.communityPost.create.mockRejectedValue(p2002);

      await expect(saveQuestion(makeQuestion())).resolves.toBeNull();
    });
  });

  describe('일반 에러 처리', () => {
    it('일반 DB 에러 → null 반환 (throw 없음)', async () => {
      prismaMock.communityPost.create.mockRejectedValue(new Error('DB connection lost'));

      const result = await saveQuestion(makeQuestion());

      expect(result).toBeNull();
    });

    it('findFirst 에러 → null 반환 가능성 없음 (findFirst는 throw 허용)', async () => {
      // findFirst가 실패하면 saveQuestion 자체가 throw됨 — 이는 의도된 동작
      // (빠른 사전 체크 실패 = 치명적 오류)
      prismaMock.communityPost.findFirst.mockRejectedValue(new Error('DB error'));

      await expect(saveQuestion(makeQuestion())).rejects.toThrow('DB error');
    });
  });

  describe('title/content truncation', () => {
    it('title 200자 초과 시 200자로 잘림', async () => {
      const longTitle = '강'.repeat(250); // 250자
      const q = makeQuestion({ title: longTitle });
      prismaMock.communityPost.create.mockResolvedValue({ id: 'post-1' });

      await saveQuestion(q);

      const createCall = prismaMock.communityPost.create.mock.calls[0][0] as {
        data: { title: string };
      };
      expect(createCall.data.title).toHaveLength(200);
      expect(createCall.data.title).toBe('강'.repeat(200));
    });

    it('content 10000자 초과 시 10000자로 잘림', async () => {
      const longContent = '내'.repeat(15000); // 15000자
      const q = makeQuestion({ content: longContent });
      prismaMock.communityPost.create.mockResolvedValue({ id: 'post-1' });

      await saveQuestion(q);

      const createCall = prismaMock.communityPost.create.mock.calls[0][0] as {
        data: { content: string };
      };
      expect(createCall.data.content).toHaveLength(10000);
      expect(createCall.data.content).toBe('내'.repeat(10000));
    });

    it('title 200자 이하 → 그대로 저장', async () => {
      const title = '짧은 제목';
      const q = makeQuestion({ title });
      prismaMock.communityPost.create.mockResolvedValue({ id: 'post-1' });

      await saveQuestion(q);

      const createCall = prismaMock.communityPost.create.mock.calls[0][0] as {
        data: { title: string };
      };
      expect(createCall.data.title).toBe(title);
    });

    it('content 10000자 이하 → 그대로 저장', async () => {
      const content = '적당한 내용';
      const q = makeQuestion({ content });
      prismaMock.communityPost.create.mockResolvedValue({ id: 'post-1' });

      await saveQuestion(q);

      const createCall = prismaMock.communityPost.create.mock.calls[0][0] as {
        data: { content: string };
      };
      expect(createCall.data.content).toBe(content);
    });
  });
});
