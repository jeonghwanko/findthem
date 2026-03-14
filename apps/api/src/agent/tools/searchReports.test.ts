import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchReports } from './searchReports.js';
import { prisma } from '../../db/client.js';

// DB mock은 setup.ts에서 전역으로 등록됨
const reportMock = (prisma as any).report;

const mockReports = [
  {
    id: 'report-1',
    name: '초코',
    subjectType: 'DOG',
    features: '갈색 푸들, 빨간 목줄',
    lastSeenAddress: '서울시 강남구 역삼동',
    photos: [{ photoUrl: '/uploads/reports/choco.jpg' }],
  },
  {
    id: 'report-2',
    name: '콩이',
    subjectType: 'DOG',
    features: '흰색 말티즈, 노란 목줄',
    lastSeenAddress: '서울시 마포구 홍대',
    photos: [],
  },
];

describe('searchReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subjectType DOG으로 검색 시 where 조건에 status:ACTIVE와 subjectType이 전달된다', async () => {
    reportMock.findMany.mockResolvedValue(mockReports as any);

    await searchReports('DOG');

    expect(reportMock.findMany).toHaveBeenCalledOnce();
    expect(reportMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', subjectType: 'DOG' },
      }),
    );
  });

  it('반환값에 reports 배열이 포함된다', async () => {
    reportMock.findMany.mockResolvedValue(mockReports as any);

    const result = await searchReports('DOG');

    expect(result).toHaveProperty('reports');
    expect(Array.isArray(result.reports)).toBe(true);
  });

  it('반환된 reports 항목은 id, name, subjectType, features, lastSeenAddress 필드를 포함한다', async () => {
    reportMock.findMany.mockResolvedValue(mockReports as any);

    const result = await searchReports('DOG');

    expect(result.reports).toHaveLength(2);

    const first = result.reports[0];
    expect(first).toHaveProperty('id', 'report-1');
    expect(first).toHaveProperty('name', '초코');
    expect(first).toHaveProperty('subjectType', 'DOG');
    expect(first).toHaveProperty('features', '갈색 푸들, 빨간 목줄');
    expect(first).toHaveProperty('lastSeenAddress', '서울시 강남구 역삼동');
  });

  it('대표 사진이 있으면 photoUrl을 포함한다', async () => {
    reportMock.findMany.mockResolvedValue(mockReports as any);

    const result = await searchReports('DOG');

    expect(result.reports[0].photoUrl).toBe('/uploads/reports/choco.jpg');
  });

  it('사진이 없는 신고는 photoUrl이 undefined이다', async () => {
    reportMock.findMany.mockResolvedValue(mockReports as any);

    const result = await searchReports('DOG');

    expect(result.reports[1].photoUrl).toBeUndefined();
  });

  it('limit 파라미터가 take로 전달된다', async () => {
    reportMock.findMany.mockResolvedValue([] as any);

    await searchReports('CAT', undefined, undefined, 3);

    expect(reportMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it('limit이 20을 초과하면 20으로 제한된다', async () => {
    reportMock.findMany.mockResolvedValue([] as any);

    await searchReports('PERSON', undefined, undefined, 100);

    expect(reportMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it('description 키워드가 있으면 관련 신고가 앞으로 정렬된다', async () => {
    const reportsForSort = [
      {
        id: 'report-a',
        name: '하늘',
        subjectType: 'DOG',
        features: '흰색 말티즈',
        lastSeenAddress: '서울시 송파구',
        photos: [],
      },
      {
        id: 'report-b',
        name: '초코',
        subjectType: 'DOG',
        features: '갈색 푸들 역삼동',
        lastSeenAddress: '서울시 강남구 역삼동',
        photos: [],
      },
    ];
    reportMock.findMany.mockResolvedValue(reportsForSort as any);

    const result = await searchReports('DOG', '갈색 푸들', '역삼동');

    // '역삼동'이 features+lastSeenAddress 모두에 포함된 report-b가 앞으로 와야 함
    expect(result.reports[0].id).toBe('report-b');
  });

  it('결과가 없으면 빈 배열을 반환한다', async () => {
    reportMock.findMany.mockResolvedValue([] as any);

    const result = await searchReports('CAT');

    expect(result.reports).toHaveLength(0);
  });

  it('include에 photos 조건이 올바르게 전달된다', async () => {
    reportMock.findMany.mockResolvedValue([] as any);

    await searchReports('DOG');

    expect(reportMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          photos: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      }),
    );
  });
});
