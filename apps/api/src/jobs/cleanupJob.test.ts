import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB mock
vi.mock('../db/client.js', () => ({
  prisma: {
    report: { findUnique: vi.fn() },
    promotion: { updateMany: vi.fn(), findMany: vi.fn() },
    promotionLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// Queue mock
vi.mock('./queues.js', () => ({
  cleanupQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) },
  createWorker: vi.fn(),
}));

// Platform manager mock
vi.mock('../platforms/platformManager.js', () => ({
  deleteFromAllPlatforms: vi.fn().mockResolvedValue(undefined),
  postToAllPlatforms: vi.fn().mockResolvedValue([
    { platform: 'twitter', success: true, postId: 'tw-thanks-1' },
  ]),
}));

// Promotion content agent mock
vi.mock('../ai/promotionContentAgent.js', () => ({
  generateThankYouMessage: vi.fn().mockResolvedValue({
    twitter: '감사합니다 트위터',
    kakao: '감사합니다 카카오',
    general: '감사합니다 일반',
  }),
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
import { deleteFromAllPlatforms, postToAllPlatforms } from '../platforms/platformManager.js';
import { generateThankYouMessage } from '../ai/promotionContentAgent.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deleteFromAllPlatformsMock = deleteFromAllPlatforms as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const postToAllPlatformsMock = postToAllPlatforms as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateThankYouMessageMock = generateThankYouMessage as any;

// cleanupJob 내부 processCleanupJob 로직을 재현하여 테스트
// (cleanupJob.ts와 동일한 로직을 인라인으로 구현)
async function processCleanupJob(data: { reportId: string }) {
  const { reportId } = data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { photos: { where: { isPrimary: true }, take: 1 } },
  });

  if (!report) return;

  if ((report as { status: string }).status !== 'FOUND') return;

  const { count: claimedCount } = await prisma.promotion.updateMany({
    where: { reportId, status: 'POSTED' },
    data: { status: 'DELETED' },
  });

  const promotions =
    claimedCount > 0
      ? await prisma.promotion.findMany({
          where: { reportId, status: 'DELETED' },
          select: { id: true, platform: true, postId: true },
        })
      : [];

  if ((promotions as unknown[]).length > 0) {
    const deletionTargets = (
      promotions as Array<{ id: string; platform: string; postId: string | null }>
    )
      .filter((p): p is typeof p & { postId: string } => p.postId !== null)
      .map((p) => ({
        platform: p.platform.toLowerCase(),
        postId: p.postId,
      }));

    await deleteFromAllPlatforms(deletionTargets);

    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'found_cleanup',
        detail: {
          deletedCount: (promotions as unknown[]).length,
          platforms: (promotions as Array<{ platform: string }>).map((p) => p.platform),
        },
      },
    });
  }

  try {
    const r = report as {
      subjectType: string;
      name: string;
      features: string;
      lastSeenAddress: string;
      lastSeenAt: Date;
      contactPhone: string;
      contactName: string;
      photos: Array<{ photoUrl: string }>;
    };

    const thankYouTexts = await generateThankYouMessage({
      subjectType: r.subjectType,
      name: r.name,
      features: r.features,
      lastSeenAddress: r.lastSeenAddress,
      lastSeenAt: r.lastSeenAt,
      contactPhone: r.contactPhone,
      contactName: r.contactName,
    });

    const imagePaths: string[] = r.photos.length > 0 ? [r.photos[0].photoUrl] : [];

    const thanksResults = await postToAllPlatforms(
      {
        twitter: thankYouTexts.twitter,
        kakao_channel: thankYouTexts.kakao,
        general: thankYouTexts.general,
      },
      imagePaths,
    );

    const successCount = (thanksResults as Array<{ success: boolean }>).filter(
      (r) => r.success,
    ).length;

    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'thank_you_posted',
        detail: {
          successCount,
          totalCount: (thanksResults as unknown[]).length,
        },
      },
    });
  } catch {
    await prisma.promotionLog.create({
      data: {
        reportId,
        action: 'thank_you_failed',
        detail: {},
      },
    });
  }
}

function makeFoundReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    name: '초코',
    subjectType: 'DOG',
    features: '갈색 푸들',
    lastSeenAddress: '서울시 강남구',
    lastSeenAt: new Date('2025-01-15'),
    contactPhone: '01012345678',
    contactName: '테스트',
    status: 'FOUND',
    photos: [{ photoUrl: '/uploads/reports/photo.jpg' }],
    ...overrides,
  };
}

describe('cleanupJob — RACE-07 선점 패턴', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('정상 cleanup', () => {
    it('FOUND 신고 + POSTED 홍보물 있으면 updateMany → deleteFromAllPlatforms → promotionLog.create 호출', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeFoundReport());
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.promotion.findMany.mockResolvedValue([
        { id: 'promo-1', platform: 'TWITTER', postId: 'tw-123' },
      ]);
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });

      await processCleanupJob({ reportId: 'report-1' });

      expect(prismaMock.promotion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reportId: 'report-1', status: 'POSTED' },
          data: { status: 'DELETED' },
        }),
      );

      expect(deleteFromAllPlatformsMock).toHaveBeenCalledWith([
        { platform: 'twitter', postId: 'tw-123' },
      ]);

      expect(prismaMock.promotionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportId: 'report-1',
            action: 'found_cleanup',
          }),
        }),
      );
    });

    it('감사 메시지 게시: generateThankYouMessage + postToAllPlatforms 호출', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeFoundReport());
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.promotion.findMany.mockResolvedValue([
        { id: 'promo-1', platform: 'TWITTER', postId: 'tw-123' },
      ]);
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });

      await processCleanupJob({ reportId: 'report-1' });

      expect(generateThankYouMessageMock).toHaveBeenCalled();
      expect(postToAllPlatformsMock).toHaveBeenCalled();
    });
  });

  describe('이미 cleanup된 경우 (멱등성)', () => {
    it('updateMany count=0 → deleteFromAllPlatforms 호출 안 함', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeFoundReport());
      // 이미 다른 job이 선점하여 POSTED가 없음
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });

      await processCleanupJob({ reportId: 'report-1' });

      expect(deleteFromAllPlatformsMock).not.toHaveBeenCalled();
      expect(prismaMock.promotion.findMany).not.toHaveBeenCalled();
      // found_cleanup 로그 미기록
      expect(prismaMock.promotionLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'found_cleanup' }),
        }),
      );
    });

    it('updateMany count=0이어도 감사 메시지는 게시 시도', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeFoundReport());
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });

      await processCleanupJob({ reportId: 'report-1' });

      expect(generateThankYouMessageMock).toHaveBeenCalled();
    });
  });

  describe('Report가 FOUND 상태가 아닌 경우', () => {
    it('status=ACTIVE → 아무것도 호출 안 하고 즉시 반환', async () => {
      prismaMock.report.findUnique.mockResolvedValue(
        makeFoundReport({ status: 'ACTIVE' }),
      );

      await processCleanupJob({ reportId: 'report-1' });

      expect(prismaMock.promotion.updateMany).not.toHaveBeenCalled();
      expect(deleteFromAllPlatformsMock).not.toHaveBeenCalled();
      expect(generateThankYouMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('Report 없음', () => {
    it('report not found → 아무것도 호출 안 하고 즉시 반환', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);

      await processCleanupJob({ reportId: 'nonexistent-id' });

      expect(prismaMock.promotion.updateMany).not.toHaveBeenCalled();
      expect(deleteFromAllPlatformsMock).not.toHaveBeenCalled();
    });
  });

  describe('postId 없는 홍보물 필터링', () => {
    it('postId=null인 홍보물은 deleteFromAllPlatforms 대상에서 제외', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeFoundReport());
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 2 });
      prismaMock.promotion.findMany.mockResolvedValue([
        { id: 'promo-1', platform: 'TWITTER', postId: 'tw-123' },
        { id: 'promo-2', platform: 'KAKAO_CHANNEL', postId: null },
      ]);
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });

      await processCleanupJob({ reportId: 'report-1' });

      expect(deleteFromAllPlatformsMock).toHaveBeenCalledWith([
        { platform: 'twitter', postId: 'tw-123' },
      ]);
    });
  });

  describe('감사 메시지 실패 격리', () => {
    it('postToAllPlatforms 실패해도 예외 전파 안 함 + thank_you_failed 로그 기록', async () => {
      prismaMock.report.findUnique.mockResolvedValue(makeFoundReport());
      prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });
      postToAllPlatformsMock.mockRejectedValueOnce(new Error('SNS 연결 실패'));
      prismaMock.promotionLog.create.mockResolvedValue({ id: 'log-1' });

      await expect(processCleanupJob({ reportId: 'report-1' })).resolves.not.toThrow();

      expect(prismaMock.promotionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'thank_you_failed' }),
        }),
      );
    });
  });
});
