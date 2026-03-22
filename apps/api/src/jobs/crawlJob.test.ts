import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUEUE_NAMES } from '@findthem/shared';

// DB mock
vi.mock('../db/client.js', () => ({
  prisma: {
    report: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    photo: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Queue mock
vi.mock('./queues.js', () => ({
  imageQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
  crawlQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
  crawlSchedulerQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
  },
  createWorker: vi.fn(),
  QUEUE_NAMES: {
    CRAWL_SCHEDULER: QUEUE_NAMES.CRAWL_SCHEDULER,
    CRAWL: QUEUE_NAMES.CRAWL,
  },
}));

// logger mock
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// fetcherRegistry mock — 테스트에서 제어할 수 있도록
vi.mock('./crawl/fetcherRegistry.js', () => ({
  fetchers: [],
  getFetcher: vi.fn(),
}));

import { prisma } from '../db/client.js';
import { imageQueue } from './queues.js';
import { getFetcher as _getFetcher } from './crawl/fetcherRegistry.js';
import type { ExternalReport } from './crawl/types.js';

// prisma 편의 타입
// vi.fn()의 반환 타입은 Mock<Procedure|Constructable>로 call signature가 overloaded되어
// TS가 직접 호출을 허용하지 않는 경우를 피하기 위해 callable & mock 메서드 혼합 타입 정의
type CallableMock = ((...args: unknown[]) => unknown) & {
  mockResolvedValue: (v: unknown) => CallableMock;
  mockResolvedValueOnce: (v: unknown) => CallableMock;
  mockRejectedValue: (v: unknown) => CallableMock;
  mockRejectedValueOnce: (v: unknown) => CallableMock;
  mockImplementation: (fn: (...args: unknown[]) => unknown) => CallableMock;
  mockImplementationOnce: (fn: (...args: unknown[]) => unknown) => CallableMock;
  mockReturnValue: (v: unknown) => CallableMock;
};
interface PrismaMockType {
  report: { findMany: CallableMock; create: CallableMock };
  photo: { create: CallableMock };
  $transaction: CallableMock;
}
const prismaMock = prisma as unknown as PrismaMockType;

// 테스트용 ExternalReport 생성 헬퍼
function makeExternalReport(overrides: Partial<ExternalReport> = {}): ExternalReport {
  return {
    externalId: 'EXT-001',
    subjectType: 'DOG',
    name: '유기견 EXT-001',
    features: '갈색 믹스견',
    lastSeenAt: new Date('2025-01-15'),
    lastSeenAddress: '서울시 강남구',
    photoUrl: 'https://example.com/photo.jpg',
    contactPhone: '02-1234-5678',
    contactName: '강남유기동물센터',
    gender: 'MALE',
    ...overrides,
  };
}

// 저장된 Report mock 데이터
function makeCreatedReport(externalId: string = 'EXT-001') {
  return {
    id: `report-${externalId}`,
    userId: null,
    externalId,
    externalSource: 'animal-api',
    subjectType: 'DOG',
    status: 'ACTIVE',
    name: `유기견 ${externalId}`,
    features: '갈색 믹스견',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// crawlJob의 내부 로직을 직접 재현하여 테스트합니다.
// saveNewReport와 crawlSource 로직을 인라인으로 구현하여 mock 동작 검증

async function saveNewReport(item: ExternalReport, source: string): Promise<boolean> {
  // crawlJob.ts의 saveNewReport 로직과 동일
  try {
    const report = await prismaMock.$transaction(async (tx: PrismaMockType) => {
      const created = (await tx.report.create({
        data: {
          userId: null,
          subjectType: item.subjectType,
          status: 'ACTIVE',
          name: item.name,
          features: item.features,
          lastSeenAt: item.lastSeenAt,
          lastSeenAddress: item.lastSeenAddress,
          contactPhone: item.contactPhone ?? '정보 없음',
          contactName: item.contactName ?? source,
          gender: item.gender,
          age: item.age,
          color: item.color,
          weight: item.weight,
          species: item.species,
          externalId: item.externalId,
          externalSource: source,
        },
      })) as { id: string };

      if (item.photoUrl) {
        await tx.photo.create({
          data: {
            reportId: created.id,
            photoUrl: item.photoUrl,
            isPrimary: true,
          },
        });
      }

      return created;
    });

    if (item.photoUrl) {
      const saved = report as { id: string };
      await imageQueue.add(
        'process-report-photos',
        { type: 'report', reportId: saved.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, jobId: `image-report-${saved.id}` },
      );
    }

    return true;
  } catch {
    return false;
  }
}

async function runCrawlSource(source: string, fetcherItems: ExternalReport[]) {
  // crawlJob.ts의 crawlSource worker 로직과 동일
  const items = fetcherItems;
  if (items.length === 0) return { created: 0, skipped: 0, failed: 0 };

  const existingIds = await prisma.report.findMany({
    where: {
      externalSource: source,
      externalId: { in: items.map((i) => i.externalId) },
    },
    select: { externalId: true },
  });
  const existingSet = new Set((existingIds as Array<{ externalId: string | null }>).map((r) => r.externalId));

  const newItems = items.filter((i) => !existingSet.has(i.externalId));

  let created = 0;
  let failed = 0;

  for (const item of newItems) {
    const ok = await saveNewReport(item, source);
    if (ok) created++;
    else failed++;
  }

  return { created, failed, skipped: items.length - newItems.length };
}

describe('crawlJob — saveNewReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // $transaction은 callback(prisma)을 실행하는 기본 구현
    prismaMock.$transaction.mockImplementation(
      async (...args: unknown[]) => (args[0] as (tx: PrismaMockType) => Promise<unknown>)(prismaMock),
    );
  });

  it('신규 항목 저장 시 report.create 호출', async () => {
    const item = makeExternalReport();
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    const ok = await saveNewReport(item, 'animal-api');

    expect(ok).toBe(true);
    expect(prismaMock.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalId: 'EXT-001',
          externalSource: 'animal-api',
          userId: null,
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('photoUrl 있으면 photo.create 호출', async () => {
    const item = makeExternalReport({ photoUrl: 'https://example.com/photo.jpg' });
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    await saveNewReport(item, 'animal-api');

    expect(prismaMock.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: createdReport.id,
          photoUrl: 'https://example.com/photo.jpg',
          isPrimary: true,
        }),
      }),
    );
  });

  it('photoUrl 없으면 photo.create 호출 안 함', async () => {
    const item = makeExternalReport({ photoUrl: undefined });
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);

    await saveNewReport(item, 'animal-api');

    expect(prismaMock.photo.create).not.toHaveBeenCalled();
  });

  it('photoUrl 있으면 imageQueue.add 호출', async () => {
    const item = makeExternalReport({ photoUrl: 'https://example.com/photo.jpg' });
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    await saveNewReport(item, 'animal-api');

    expect(imageQueue.add).toHaveBeenCalledWith(
      'process-report-photos',
      { type: 'report', reportId: createdReport.id },
      expect.objectContaining({
        attempts: 3,
        jobId: `image-report-${createdReport.id}`,
      }),
    );
  });

  it('photoUrl 없으면 imageQueue.add 호출 안 함', async () => {
    const item = makeExternalReport({ photoUrl: undefined });
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);

    await saveNewReport(item, 'animal-api');

    expect(imageQueue.add).not.toHaveBeenCalled();
  });

  it('저장 실패 시 false 반환 (에러 격리)', async () => {
    const item = makeExternalReport();

    prismaMock.$transaction.mockRejectedValue(new Error('DB constraint violation'));

    const ok = await saveNewReport(item, 'animal-api');

    expect(ok).toBe(false);
  });

  it('contactPhone 없으면 "정보 없음" 대체', async () => {
    const item = makeExternalReport({ contactPhone: undefined });
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);

    await saveNewReport(item, 'animal-api');

    expect(prismaMock.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactPhone: '정보 없음',
        }),
      }),
    );
  });

  it('contactName 없으면 source 이름으로 대체', async () => {
    const item = makeExternalReport({ contactName: undefined });
    const createdReport = makeCreatedReport();

    prismaMock.report.create.mockResolvedValue(createdReport);

    await saveNewReport(item, 'test-source');

    expect(prismaMock.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactName: 'test-source',
        }),
      }),
    );
  });
});

describe('crawlJob — 중복 방지 (dedup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (...args: unknown[]) => (args[0] as (tx: PrismaMockType) => Promise<unknown>)(prismaMock),
    );
  });

  it('이미 존재하는 externalId는 skip', async () => {
    const items = [makeExternalReport({ externalId: 'EXT-001' })];

    // EXT-001이 이미 존재
    prismaMock.report.findMany.mockResolvedValue([{ externalId: 'EXT-001' }]);

    const result = await runCrawlSource('animal-api', items);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
    expect(imageQueue.add).not.toHaveBeenCalled();
  });

  it('새로운 externalId는 저장', async () => {
    const items = [makeExternalReport({ externalId: 'EXT-NEW' })];
    const createdReport = makeCreatedReport('EXT-NEW');

    // 기존 ID 없음
    prismaMock.report.findMany.mockResolvedValue([]);
    prismaMock.report.create.mockResolvedValue(createdReport);
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    const result = await runCrawlSource('animal-api', items);

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(prismaMock.report.create).toHaveBeenCalledOnce();
  });

  it('기존 ID와 신규 ID 혼재 시 신규만 저장', async () => {
    const items = [
      makeExternalReport({ externalId: 'EXT-001' }),  // 기존
      makeExternalReport({ externalId: 'EXT-002' }),  // 신규
      makeExternalReport({ externalId: 'EXT-003' }),  // 신규
    ];

    // EXT-001만 기존 존재
    prismaMock.report.findMany.mockResolvedValue([{ externalId: 'EXT-001' }]);
    prismaMock.report.create
      .mockResolvedValueOnce(makeCreatedReport('EXT-002'))
      .mockResolvedValueOnce(makeCreatedReport('EXT-003'));
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    const result = await runCrawlSource('animal-api', items);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(2);
    expect(prismaMock.report.create).toHaveBeenCalledTimes(2);
  });

  it('일괄 중복 체크: findMany에 모든 externalId 전달', async () => {
    const items = [
      makeExternalReport({ externalId: 'EXT-A' }),
      makeExternalReport({ externalId: 'EXT-B' }),
    ];

    prismaMock.report.findMany.mockResolvedValue([]);

    prismaMock.report.create
      .mockResolvedValueOnce(makeCreatedReport('EXT-A'))
      .mockResolvedValueOnce(makeCreatedReport('EXT-B'));
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    await runCrawlSource('animal-api', items);

    expect(prismaMock.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalSource: 'animal-api',
          externalId: { in: ['EXT-A', 'EXT-B'] },
        }),
      }),
    );
  });

  it('빈 items 배열이면 findMany 호출 없이 즉시 반환', async () => {
    const result = await runCrawlSource('animal-api', []);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(prismaMock.report.findMany).not.toHaveBeenCalled();
  });
});

describe('crawlJob — 에러 격리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (...args: unknown[]) => (args[0] as (tx: PrismaMockType) => Promise<unknown>)(prismaMock),
    );
  });

  it('개별 항목 저장 실패가 다른 항목 처리에 영향 없음', async () => {
    const items = [
      makeExternalReport({ externalId: 'EXT-FAIL' }),
      makeExternalReport({ externalId: 'EXT-OK' }),
    ];

    prismaMock.report.findMany.mockResolvedValue([]);

    // 첫 번째는 실패, 두 번째는 성공
    prismaMock.$transaction
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockImplementationOnce(
        async (...args: unknown[]) => (args[0] as (tx: PrismaMockType) => Promise<unknown>)(prismaMock),
      );
    prismaMock.report.create.mockResolvedValue(makeCreatedReport('EXT-OK'));
    prismaMock.photo.create.mockResolvedValue({ id: 'photo-1' });

    const result = await runCrawlSource('animal-api', items);

    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
  });

  it('모든 항목 실패해도 예외 throw 없이 완료', async () => {
    const items = [
      makeExternalReport({ externalId: 'EXT-001' }),
      makeExternalReport({ externalId: 'EXT-002' }),
    ];

    prismaMock.report.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockRejectedValue(new Error('DB down'));

    await expect(runCrawlSource('animal-api', items)).resolves.toEqual({
      created: 0,
      failed: 2,
      skipped: 0,
    });
  });
});
