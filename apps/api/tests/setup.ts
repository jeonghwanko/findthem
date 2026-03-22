import { vi, beforeEach } from 'vitest';

// ── Prisma Mock ──
// vi.mock은 호이스팅되므로 팩토리 함수 내부에서 독립적으로 mock 객체를 생성.
// 각 테스트 파일에서는 `import { prisma } from '../src/db/client.js'`로 이 mock을 가져온다.
vi.mock('../src/db/client.js', () => {
  function createModelMock() {
    return {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    };
  }

  const mock = {
    user: createModelMock(),
    report: createModelMock(),
    photo: createModelMock(),
    sighting: createModelMock(),
    match: createModelMock(),
    promotion: createModelMock(),
    promotionLog: createModelMock(),
    promotionStrategy: createModelMock(),
    chatSession: createModelMock(),
    chatMessage: createModelMock(),
    adminAuditLog: createModelMock(),
    communityPost: { ...createModelMock(), groupBy: vi.fn() },
    communityComment: createModelMock(),
    agentDecisionLog: { ...createModelMock(), groupBy: vi.fn() },
    externalAgent: createModelMock(),
    userReward: createModelMock(),
    sponsor: createModelMock(),
    sponsorCryptoQuote: createModelMock(),
    inquiry: createModelMock(),
    gamePlay: createModelMock(),
    pushSubscription: createModelMock(),
    outreachRequest: createModelMock(),
    $connect: vi.fn(),
    $executeRaw: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  };

  // $transaction: callback에 self를 tx로 전달
  mock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(mock);
  });

  return { prisma: mock };
});

// ── IORedis Mock (rate limiter용, Redis 연결 방지) ──
vi.mock('ioredis', () => {
  const IORedis = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockRejectedValue(new Error('mock')),
    on: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    disconnect: vi.fn(),
  }));
  return { default: IORedis };
});

// ── BullMQ Mock ──
vi.mock('bullmq', () => {
  const Queue = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    close: vi.fn(),
  }));

  const Worker = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  }));

  return { Queue, Worker };
});

// ── Sharp Mock ──
vi.mock('sharp', () => {
  const sharpInstance = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-image')),
    toFile: vi.fn().mockResolvedValue({}),
    metadata: vi.fn().mockResolvedValue({ width: 1000, height: 1000 }),
  };
  const sharp = vi.fn(() => sharpInstance);
  return { default: sharp };
});

// ── Anthropic SDK Mock ──
vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"result": "mock"}' }],
      }),
    },
  }));
  return { default: Anthropic };
});

// ── Sighting Agent Mock ──
vi.mock('../src/agent/sightingAgent.js', () => ({
  sightingAgent: {
    processMessage: vi.fn().mockResolvedValue({
      text: '제보 내용을 수집하겠습니다.',
      completed: false,
      toolsUsed: [],
    }),
  },
}));

// ── Chatbot Engine Mock ──
vi.mock('../src/chatbot/engine.js', () => ({
  chatbotEngine: {
    startSession: vi.fn().mockResolvedValue({
      sessionId: 'mock-session-id',
      response: {
        text: '안녕하세요! 어떤 정보를 제보하시겠어요?',
        quickReplies: ['사람', '강아지', '고양이'],
      },
    }),
    processMessage: vi.fn().mockResolvedValue({
      text: '감사합니다!',
      quickReplies: [],
    }),
  },
}));

// ── Image Service Mock ──
vi.mock('../src/services/imageService.js', () => ({
  imageService: {
    processAndSave: vi.fn().mockResolvedValue({
      photoUrl: '/uploads/reports/mock-photo.jpg',
      thumbnailUrl: '/uploads/thumbs/mock-photo.jpg',
    }),
    toBase64: vi.fn().mockResolvedValue('base64-mock-data'),
  },
}));

// ── Queue Mock ──
const mockQueue = () => ({
  add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  getWaitingCount: vi.fn().mockResolvedValue(0),
  getActiveCount: vi.fn().mockResolvedValue(0),
});
vi.mock('../src/jobs/queues.js', () => ({
  imageQueue: mockQueue(),
  promotionQueue: mockQueue(),
  matchingQueue: mockQueue(),
  notificationQueue: mockQueue(),
  cleanupQueue: mockQueue(),
  promotionMonitorQueue: mockQueue(),
  promotionRepostQueue: mockQueue(),
  crawlSchedulerQueue: mockQueue(),
  crawlQueue: mockQueue(),
  outreachQueue: mockQueue(),
  qaCrawlQueue: mockQueue(),
  createWorker: vi.fn(),
}));

// ── Rate Limiter Mock ──
// 각 테스트 전 rate limit store를 초기화하여 테스트 간 간섭 방지
vi.mock('../src/middlewares/rateLimit.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/middlewares/rateLimit.js')>();
  return {
    ...original,
  };
});

beforeEach(async () => {
  const { clearRateLimitStore } = await import('../src/middlewares/rateLimit.js');
  clearRateLimitStore();
});

// ── 각 테스트 전 모든 mock 초기화 ──
// 각 테스트 파일에서 `import { prisma } from '../src/db/client.js'`로 mock 접근
// beforeEach에서 기본 mock 설정 (특히 requireAuth용 user.findUnique)
// 주의: 이 beforeEach는 setup.ts의 module-scope prisma를 쓰지 않음.
// 실제 초기화는 각 테스트 파일의 beforeEach에서 수행한다.
// (setup.ts의 prisma import는 테스트 파일과 다른 module instance이므로 사용 불가)
