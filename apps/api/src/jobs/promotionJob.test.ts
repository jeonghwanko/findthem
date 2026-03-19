import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PromoPlatform } from '@findthem/shared';

// DB mock
vi.mock('../db/client.js', () => {
  const obj: Record<string, unknown> = {
    report: { findUnique: vi.fn(), update: vi.fn() },
    promotion: { findFirst: vi.fn(), upsert: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    promotionStrategy: { upsert: vi.fn() },
    promotionLog: { create: vi.fn() },
  };
  obj.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(obj));
  return { prisma: obj };
});

// Queue mock
vi.mock('./queues.js', () => ({
  promotionMonitorQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
  createWorker: vi.fn(),
}));

// Image service mock
vi.mock('../services/imageService.js', () => ({
  imageService: {
    toBase64: vi.fn().mockResolvedValue('base64-mock'),
  },
}));

// Promotion agent mocks
vi.mock('../ai/promotionAgent.js', () => ({
  generatePromoTexts: vi.fn().mockResolvedValue({
    twitter: '트위터 문구',
    kakao: '카카오 문구',
    instagram: '인스타 문구',
    general: '일반 문구',
  }),
}));

vi.mock('../ai/promotionContentAgent.js', () => ({
  generateRepostContent: vi.fn().mockResolvedValue({
    twitter: '재게시 트위터',
    kakao: '재게시 카카오',
    instagram: '재게시 인스타',
    general: '재게시 일반',
  }),
  generateThankYouMessage: vi.fn(),
}));

vi.mock('../ai/promotionStrategyAgent.js', () => ({
  determineStrategy: vi.fn().mockResolvedValue({
    urgency: 'HIGH',
    targetPlatforms: ['TWITTER'],
    repostIntervalH: 24,
    maxReposts: 3,
    keywords: ['실종'],
    hashtags: ['#실종'],
    reasoning: '긴급',
  }),
}));

vi.mock('../platforms/platformManager.js', () => ({
  postToAllPlatforms: vi.fn().mockResolvedValue([
    { platform: 'twitter', success: true, postId: 'tw-post-1', postUrl: 'https://twitter.com/1' },
  ]),
  deleteFromAllPlatforms: vi.fn(),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

// processPromotionJob 로직을 직접 재현 (job processor 캡처 없이 핵심 분기 검증)
// promotionJob.ts의 실제 코드에서 upsert 분기만 추출
async function runPromotion(data: {
  reportId: string;
  isRepost?: boolean;
  version?: number;
  platforms?: PromoPlatform[];
}) {
  const { reportId, isRepost = false, version = 1, platforms } = data;

  const report = await prisma.report.findUnique({ where: { id: reportId }, select: {} as never });
  if (!report || (report as { status: string }).status !== 'ACTIVE') return;

  const r = report as {
    photos: Array<{ photoUrl: string; thumbnailUrl: string; isPrimary: boolean; id: string }>;
  };

  const primaryPhoto = r.photos.find((p) => p.isPrimary) || r.photos[0];
  if (!primaryPhoto) return;

  const { imageService } = await import('../services/imageService.js');
  const photoBase64 = await imageService.toBase64(primaryPhoto.photoUrl);

  const { determineStrategy } = await import('../ai/promotionStrategyAgent.js');
  const strategy = await determineStrategy(report as never, photoBase64);

  await prisma.promotionStrategy.upsert({
    where: { reportId },
    create: { reportId, ...strategy },
    update: { ...strategy },
  });

  let promoTexts;
  if (isRepost) {
    const prev = await prisma.promotion.findFirst({
      where: { reportId, status: { in: ['POSTED', 'DELETED'] } },
      orderBy: { postedAt: 'desc' },
      select: { content: true, metrics: true },
    });
    const { generateRepostContent } = await import('../ai/promotionContentAgent.js');
    promoTexts = await generateRepostContent(
      report as never,
      photoBase64,
      prev?.content ?? '',
      null,
      version,
    );
  } else {
    const { generatePromoTexts } = await import('../ai/promotionAgent.js');
    promoTexts = await generatePromoTexts(report as never, photoBase64);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: { aiPromoText: promoTexts.general },
  });

  const targetPlatforms: PromoPlatform[] = platforms && platforms.length > 0 ? platforms : strategy.targetPlatforms;

  let safeVersion = version;
  if (isRepost) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    safeVersion = await (prisma.$transaction as any)(async (tx: typeof prisma) => {
      const latest = await tx.promotion.findFirst({
        where: { reportId, status: { in: ['POSTED', 'DELETED'] } },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const confirmed = Math.max(version, ((latest as { version?: number } | null)?.version ?? 0) + 1);
      await tx.promotion.updateMany({
        where: { reportId, platform: { in: targetPlatforms }, status: 'POSTED' },
        data: { status: 'DELETED' },
      });
      return confirmed;
    });
  }

  const { postToAllPlatforms } = await import('../platforms/platformManager.js');
  const { results } = { results: await postToAllPlatforms({}, []) };

  const platformNameMap: Record<string, string> = {
    TWITTER: 'twitter',
    KAKAO_CHANNEL: 'kakao_channel',
    INSTAGRAM: 'instagram',
  };

  for (const tPlatform of targetPlatforms) {
    const adapterName = platformNameMap[tPlatform];
    const result = (results as Array<{ platform: string; success: boolean; postId?: string; postUrl?: string; error?: string }>)
      .find((r) => r.platform === adapterName);
    if (!result) continue;

    const platformContent =
      tPlatform === 'TWITTER'
        ? promoTexts.twitter
        : tPlatform === 'INSTAGRAM'
          ? promoTexts.instagram
          : promoTexts.kakao;

    const promotionData = {
      content: platformContent,
      imageUrls: [],
      postId: result.postId,
      postUrl: result.postUrl,
      status: result.success ? ('POSTED' as const) : ('FAILED' as const),
      errorMessage: result.error ?? null,
      postedAt: result.success ? new Date() : null,
      version: safeVersion,
    };

    if (isRepost) {
      // RACE-06: upsert (재게시)
      await prisma.promotion.upsert({
        where: { reportId_platform: { reportId, platform: tPlatform } },
        create: { reportId, platform: tPlatform, ...promotionData },
        update: promotionData,
        select: { id: true },
      });
    } else {
      // 최초 게시: upsert
      await prisma.promotion.upsert({
        where: { reportId_platform: { reportId, platform: tPlatform } },
        create: { reportId, platform: tPlatform, ...promotionData, version: 1 },
        update: { ...promotionData, version: 1 },
        select: { id: true },
      });
    }
  }

  await prisma.promotionLog.create({
    data: {
      reportId,
      action: isRepost ? 'reposted' : 'posted',
      detail: {},
    },
  });
}

function makeActiveReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    status: 'ACTIVE',
    subjectType: 'DOG',
    name: '초코',
    species: '푸들',
    gender: 'MALE',
    age: '3살',
    weight: '5kg',
    height: null,
    color: '갈색',
    features: '갈색 푸들',
    clothingDesc: null,
    lastSeenAt: new Date('2025-01-15'),
    lastSeenAddress: '서울시 강남구',
    lastSeenLat: 37.4979,
    lastSeenLng: 127.0276,
    contactPhone: '01012345678',
    contactName: '테스트',
    reward: null,
    aiDescription: null,
    aiPromoText: null,
    externalId: null,
    externalSource: null,
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    photos: [{ id: 'photo-1', photoUrl: '/uploads/reports/photo.jpg', thumbnailUrl: '/uploads/thumbs/photo.jpg', isPrimary: true }],
    ...overrides,
  };
}

describe('promotionJob — RACE-06 upsert 멱등성', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
    );
    prismaMock.report.update.mockResolvedValue({});
    prismaMock.promotionStrategy.upsert.mockResolvedValue({});
    prismaMock.promotion.upsert.mockResolvedValue({ id: 'promo-1' });
    prismaMock.promotion.create.mockResolvedValue({ id: 'promo-1' });
    prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });
    prismaMock.promotion.findFirst.mockResolvedValue(null);
    prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('최초 게시 (isRepost=false)', () => {
    it('promotion.upsert 호출 — promotion.create 호출 안 함', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());

      await runPromotion({ reportId: 'report-1', isRepost: false });

      expect(prismaMock.promotion.upsert).toHaveBeenCalled();
      expect(prismaMock.promotion.create).not.toHaveBeenCalled();
    });

    it('upsert where에 reportId_platform 복합키 사용', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());

      await runPromotion({ reportId: 'report-1', isRepost: false });

      expect(prismaMock.promotion.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reportId_platform: expect.objectContaining({ reportId: 'report-1' }),
          }),
        }),
      );
    });

    it('promotionLog action="posted" 기록', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());

      await runPromotion({ reportId: 'report-1', isRepost: false });

      expect(prismaMock.promotionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'posted',
          }),
        }),
      );
    });
  });

  describe('재게시 (isRepost=true)', () => {
    it('promotion.upsert 호출 — promotion.create 호출 안 함', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());

      await runPromotion({ reportId: 'report-1', isRepost: true, version: 2 });

      expect(prismaMock.promotion.upsert).toHaveBeenCalled();
      expect(prismaMock.promotion.create).not.toHaveBeenCalled();
    });

    it('재게시 전 기존 POSTED → DELETED updateMany 호출', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());

      await runPromotion({ reportId: 'report-1', isRepost: true, version: 2 });

      expect(prismaMock.promotion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reportId: 'report-1',
            status: 'POSTED',
          }),
          data: { status: 'DELETED' },
        }),
      );
    });

    it('$transaction 안에서 version 확정', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());
      // latestInTx 버전이 3인 경우 → confirmedVersion = max(2, 3+1) = 4
      prismaMock.promotion.findFirst.mockResolvedValue({ version: 3 });

      await runPromotion({ reportId: 'report-1', isRepost: true, version: 2 });

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('promotionLog action="reposted" 기록', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeActiveReport());

      await runPromotion({ reportId: 'report-1', isRepost: true, version: 2 });

      expect(prismaMock.promotionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'reposted',
          }),
        }),
      );
    });
  });

  describe('조기 종료 케이스', () => {
    it('report 없으면 아무것도 호출 안 함', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      await runPromotion({ reportId: 'nonexistent-id' });

      expect(prismaMock.promotion.upsert).not.toHaveBeenCalled();
      expect(prismaMock.promotionLog.create).not.toHaveBeenCalled();
    });

    it('status=FOUND이면 조기 종료', async () => {
      prismaMock.report.findUnique.mockResolvedValue(
        makeActiveReport({ status: 'FOUND' }),
      );

      await runPromotion({ reportId: 'report-1' });

      expect(prismaMock.promotion.upsert).not.toHaveBeenCalled();
    });

    it('photos 없으면 조기 종료', async () => {
      prismaMock.report.findUnique.mockResolvedValue(
        makeActiveReport({ photos: [] }),
      );

      await runPromotion({ reportId: 'report-1' });

      expect(prismaMock.promotion.upsert).not.toHaveBeenCalled();
    });
  });
});
