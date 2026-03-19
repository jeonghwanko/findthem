import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUEUE_NAMES } from '@findthem/shared';
import { prisma } from '../db/client.js';

// setup.ts에서 전역 prisma mock이 등록되어 있으므로 여기서 참조
const reportMock = (prisma as any).report;
const sightingMock = (prisma as any).sighting;
const matchMock = (prisma as any).match;
const userMock = (prisma as any).user;

// setup.ts의 queues mock은 add만 정의되어 있어서 getWaitingCount 등이 없다.
// 서비스 import 전에 queues 모듈을 다시 mock한다.
// 파일 내 vi.mock은 hoisting되어 setup.ts보다 이 파일의 것이 우선 적용됨.

const imageQueueMock = {
  name: QUEUE_NAMES.IMAGE_PROCESSING,
  add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  getWaitingCount: vi.fn().mockResolvedValue(0),
  getActiveCount: vi.fn().mockResolvedValue(0),
  getCompletedCount: vi.fn().mockResolvedValue(0),
  getFailedCount: vi.fn().mockResolvedValue(0),
  getDelayedCount: vi.fn().mockResolvedValue(0),
  isPaused: vi.fn().mockResolvedValue(false),
  getFailed: vi.fn().mockResolvedValue([]),
  client: Promise.resolve({ ping: vi.fn().mockResolvedValue('PONG') }),
};

function makeQueueMock(name: string) {
  return {
    name,
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
    isPaused: vi.fn().mockResolvedValue(false),
    getFailed: vi.fn().mockResolvedValue([]),
    client: Promise.resolve({ ping: vi.fn().mockResolvedValue('PONG') }),
  };
}

vi.mock('../jobs/queues.js', () => ({
  imageQueue: imageQueueMock,
  promotionQueue: makeQueueMock(QUEUE_NAMES.PROMOTION),
  matchingQueue: makeQueueMock(QUEUE_NAMES.MATCHING),
  notificationQueue: makeQueueMock(QUEUE_NAMES.NOTIFICATION),
  cleanupQueue: makeQueueMock(QUEUE_NAMES.CLEANUP),
  promotionMonitorQueue: makeQueueMock(QUEUE_NAMES.PROMOTION_MONITOR),
  promotionRepostQueue: makeQueueMock(QUEUE_NAMES.PROMOTION_REPOST),
  crawlSchedulerQueue: makeQueueMock(QUEUE_NAMES.CRAWL_SCHEDULER),
  crawlQueue: makeQueueMock(QUEUE_NAMES.CRAWL),
  QUEUE_MAP: {
    [QUEUE_NAMES.IMAGE_PROCESSING]: imageQueueMock,
    [QUEUE_NAMES.PROMOTION]: makeQueueMock(QUEUE_NAMES.PROMOTION),
    [QUEUE_NAMES.MATCHING]: makeQueueMock(QUEUE_NAMES.MATCHING),
    [QUEUE_NAMES.NOTIFICATION]: makeQueueMock(QUEUE_NAMES.NOTIFICATION),
    [QUEUE_NAMES.CLEANUP]: makeQueueMock(QUEUE_NAMES.CLEANUP),
    [QUEUE_NAMES.PROMOTION_MONITOR]: makeQueueMock(QUEUE_NAMES.PROMOTION_MONITOR),
    [QUEUE_NAMES.PROMOTION_REPOST]: makeQueueMock(QUEUE_NAMES.PROMOTION_REPOST),
    [QUEUE_NAMES.CRAWL_SCHEDULER]: makeQueueMock(QUEUE_NAMES.CRAWL_SCHEDULER),
    [QUEUE_NAMES.CRAWL]: makeQueueMock(QUEUE_NAMES.CRAWL),
  },
  createWorker: vi.fn(),
}));

// queues mock 재정의 후 서비스 import
const { getOverviewStats, getQueueStatuses } = await import('./adminStatsService.js');

function setupDefaultDbMocks() {
  reportMock.count.mockResolvedValue(10);
  sightingMock.count.mockResolvedValue(5);
  sightingMock.groupBy = vi.fn().mockResolvedValue([
    { source: 'WEB', _count: 3 },
    { source: 'KAKAO_CHATBOT', _count: 2 },
  ]);
  matchMock.count.mockResolvedValue(4);
  matchMock.aggregate.mockResolvedValue({ _avg: { confidence: 0.75 } });
  userMock.count.mockResolvedValue(20);
}

describe('getOverviewStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 후 큐 mock 복원
    imageQueueMock.getWaitingCount.mockResolvedValue(0);
    imageQueueMock.getActiveCount.mockResolvedValue(0);
    imageQueueMock.getCompletedCount.mockResolvedValue(0);
    imageQueueMock.getFailedCount.mockResolvedValue(0);
    imageQueueMock.getDelayedCount.mockResolvedValue(0);
    imageQueueMock.isPaused.mockResolvedValue(false);
    setupDefaultDbMocks();
  });

  it('반환값에 reports, sightings, matches, users, queues 필드가 있다', async () => {
    const result = await getOverviewStats();

    expect(result).toHaveProperty('reports');
    expect(result).toHaveProperty('sightings');
    expect(result).toHaveProperty('matches');
    expect(result).toHaveProperty('users');
    expect(result).toHaveProperty('queues');
  });

  it('reports 통계가 올바른 구조를 갖는다', async () => {
    const result = await getOverviewStats();

    expect(result.reports).toHaveProperty('total');
    expect(result.reports).toHaveProperty('active');
    expect(result.reports).toHaveProperty('found');
    expect(result.reports).toHaveProperty('suspended');
    expect(result.reports).toHaveProperty('todayNew');
    expect(result.reports).toHaveProperty('weekNew');
  });

  it('sightings 통계가 올바른 구조를 갖는다', async () => {
    const result = await getOverviewStats();

    expect(result.sightings).toHaveProperty('total');
    expect(result.sightings).toHaveProperty('todayNew');
    expect(result.sightings).toHaveProperty('weekNew');
    expect(result.sightings).toHaveProperty('bySource');
  });

  it('matches 통계가 올바른 구조를 갖는다', async () => {
    const result = await getOverviewStats();

    expect(result.matches).toHaveProperty('total');
    expect(result.matches).toHaveProperty('confirmed');
    expect(result.matches).toHaveProperty('pending');
    expect(result.matches).toHaveProperty('avgConfidence');
    expect(result.matches).toHaveProperty('highConfidenceCount');
  });

  it('users 통계가 올바른 구조를 갖는다', async () => {
    const result = await getOverviewStats();

    expect(result.users).toHaveProperty('total');
    expect(result.users).toHaveProperty('todayNew');
    expect(result.users).toHaveProperty('blocked');
  });

  it('queues는 배열이며 각 항목에 name, waiting, active, failed 필드가 있다', async () => {
    const result = await getOverviewStats();

    expect(Array.isArray(result.queues)).toBe(true);
    expect(result.queues.length).toBeGreaterThan(0);

    const firstQueue = result.queues[0];
    expect(firstQueue).toHaveProperty('name');
    expect(firstQueue).toHaveProperty('waiting');
    expect(firstQueue).toHaveProperty('active');
    expect(firstQueue).toHaveProperty('failed');
  });

  it('여러 개의 prisma.report.count 호출이 이루어진다', async () => {
    await getOverviewStats();

    // total, ACTIVE, FOUND, SUSPENDED, today, week = 6회
    expect(reportMock.count).toHaveBeenCalledTimes(6);
  });

  it('prisma.sighting.count가 여러 번 호출된다', async () => {
    await getOverviewStats();

    // total, today, week = 3회
    expect(sightingMock.count).toHaveBeenCalledTimes(3);
  });

  it('match.aggregate로 avgConfidence를 조회한다', async () => {
    matchMock.aggregate.mockResolvedValue({ _avg: { confidence: 0.82 } });

    const result = await getOverviewStats();

    expect(matchMock.aggregate).toHaveBeenCalledOnce();
    expect(result.matches.avgConfidence).toBe(0.82);
  });

  it('aggregate에서 confidence가 null이면 avgConfidence는 0이다', async () => {
    matchMock.aggregate.mockResolvedValue({ _avg: { confidence: null } });

    const result = await getOverviewStats();

    expect(result.matches.avgConfidence).toBe(0);
  });

  it('sightingBySource가 bySource 객체로 변환된다', async () => {
    sightingMock.groupBy = vi.fn().mockResolvedValue([
      { source: 'WEB', _count: 7 },
      { source: 'KAKAO_CHATBOT', _count: 3 },
      { source: 'ADMIN', _count: 1 },
    ]);

    const result = await getOverviewStats();

    expect(result.sightings.bySource.WEB).toBe(7);
    expect(result.sightings.bySource.KAKAO_CHATBOT).toBe(3);
    expect(result.sightings.bySource.ADMIN).toBe(1);
  });
});

describe('getQueueStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageQueueMock.getWaitingCount.mockResolvedValue(0);
    imageQueueMock.getActiveCount.mockResolvedValue(0);
    imageQueueMock.getCompletedCount.mockResolvedValue(0);
    imageQueueMock.getFailedCount.mockResolvedValue(0);
    imageQueueMock.getDelayedCount.mockResolvedValue(0);
    imageQueueMock.isPaused.mockResolvedValue(false);
  });

  it('QueueStatusSummary 배열을 반환한다', async () => {
    const result = await getQueueStatuses();

    expect(Array.isArray(result)).toBe(true);
  });

  it('각 큐 항목에 name, waiting, active, completed, failed, delayed, paused 필드가 있다', async () => {
    const result = await getQueueStatuses();

    for (const queue of result) {
      expect(queue).toHaveProperty('name');
      expect(queue).toHaveProperty('waiting');
      expect(queue).toHaveProperty('active');
      expect(queue).toHaveProperty('completed');
      expect(queue).toHaveProperty('failed');
      expect(queue).toHaveProperty('delayed');
      expect(queue).toHaveProperty('paused');
    }
  });

  it('image-processing 큐 상태를 포함한다', async () => {
    imageQueueMock.getWaitingCount.mockResolvedValue(5);
    imageQueueMock.getFailedCount.mockResolvedValue(2);

    const result = await getQueueStatuses();
    const imageStatus = result.find((q) => q.name === QUEUE_NAMES.IMAGE_PROCESSING);

    expect(imageStatus).toBeDefined();
    expect(imageStatus!.waiting).toBe(5);
    expect(imageStatus!.failed).toBe(2);
  });
});
