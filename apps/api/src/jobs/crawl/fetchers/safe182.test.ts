import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config.js', () => ({
  config: {
    publicDataApiKey: 'public-api-key',
    safe182ApiKey: 'safe182-key',
  },
}));

vi.mock('../../../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { safe182Fetcher } from './safe182.js';
import { config } from '../../../config.js';

function makeApiResponse(items: unknown[], totalCount = items.length) {
  return {
    response: {
      body: {
        totalCount,
        items: {
          item: items,
        },
      },
    },
  };
}

function makeMissingChildItem(overrides: Record<string, string> = {}) {
  return {
    msspsnIdntfccd: 'MISSING-001',
    msspsnNm: '홍길동',
    sexdstnCode: 'M',
    birthYmd: '20100515',
    mssgnArCn: '서울시 종로구 종로1가',
    mssgnYmd: '20250115',
    writngTelno: '02-112',
    writngInstNm: '서울종로경찰서',
    physclcd: '키 150cm, 검은 머리',
    filePathNm: 'https://example.com/missing.jpg',
    ...overrides,
  };
}

describe('safe182Fetcher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // 기본 키 복구
    (config as Record<string, unknown>).safe182ApiKey = 'safe182-key';
    (config as Record<string, unknown>).publicDataApiKey = 'public-api-key';
  });

  describe('API 키 없을 때', () => {
    it('safe182ApiKey와 publicDataApiKey 모두 없으면 빈 배열 반환', async () => {
      (config as Record<string, unknown>).safe182ApiKey = '';
      (config as Record<string, unknown>).publicDataApiKey = '';

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const result = await safe182Fetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('safe182ApiKey 없어도 publicDataApiKey 있으면 API 호출', async () => {
      (config as Record<string, unknown>).safe182ApiKey = '';
      (config as Record<string, unknown>).publicDataApiKey = 'public-api-key';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem()])),
      });

      const result = await safe182Fetcher.fetch();

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('API URL 및 파라미터 검증', () => {
    it('올바른 URL과 파라미터로 fetch 호출', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem()])),
      });
      global.fetch = fetchSpy;

      await safe182Fetcher.fetch();

      expect(fetchSpy).toHaveBeenCalled();
      const calledUrl: string = fetchSpy.mock.calls[0][0] as string;

      expect(calledUrl).toContain('apis.data.go.kr');
      expect(calledUrl).toContain('missingChildInfoService');
      expect(calledUrl).toContain('getMissingChildList');
      expect(calledUrl).toContain('serviceKey=safe182-key');
      expect(calledUrl).toContain('_type=json');
      expect(calledUrl).toContain('numOfRows=100');
      expect(calledUrl).toContain('pageNo=1');
    });
  });

  describe('정상 응답 파싱', () => {
    it('실종아동 API 응답을 ExternalReport[]로 변환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem()])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results).toHaveLength(1);
      const report = results[0];
      expect(report.externalId).toBe('MISSING-001');
      expect(report.subjectType).toBe('PERSON');
      expect(report.name).toBe('홍길동');
      expect(report.features).toBe('키 150cm, 검은 머리');
      expect(report.lastSeenAddress).toBe('서울시 종로구 종로1가');
      expect(report.photoUrl).toBe('https://example.com/missing.jpg');
      expect(report.contactPhone).toBe('02-112');
      expect(report.contactName).toBe('서울종로경찰서');
    });

    it('모든 항목의 subjectType은 PERSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([
            makeMissingChildItem({ msspsnIdntfccd: 'P-001' }),
            makeMissingChildItem({ msspsnIdntfccd: 'P-002' }),
          ], 2)),
      });

      const results = await safe182Fetcher.fetch();

      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.subjectType).toBe('PERSON'));
    });

    it('단일 item이 객체로 반환되어도 처리', async () => {
      const singleItemResponse = {
        response: {
          body: {
            totalCount: 1,
            items: {
              item: makeMissingChildItem(), // 배열이 아닌 단일 객체
            },
          },
        },
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(singleItemResponse),
      });

      const results = await safe182Fetcher.fetch();

      expect(results).toHaveLength(1);
    });

    it('이름 없으면 "이름 미상" 사용', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ msspsnNm: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].name).toBe('이름 미상');
    });

    it('장소 없으면 "장소 미상" 사용', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ mssgnArCn: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].lastSeenAddress).toBe('장소 미상');
    });
  });

  describe('externalId 고유성', () => {
    it('각 항목의 externalId는 msspsnIdntfccd 값', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([
            makeMissingChildItem({ msspsnIdntfccd: 'ID-AAA' }),
            makeMissingChildItem({ msspsnIdntfccd: 'ID-BBB' }),
            makeMissingChildItem({ msspsnIdntfccd: 'ID-CCC' }),
          ], 3)),
      });

      const results = await safe182Fetcher.fetch();

      const ids = results.map((r) => r.externalId);
      expect(ids).toEqual(['ID-AAA', 'ID-BBB', 'ID-CCC']);
      // 중복 없음 확인
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('gender 매핑', () => {
    it('sexdstnCode "M" → MALE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ sexdstnCode: 'M' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].gender).toBe('MALE');
    });

    it('sexdstnCode "F" → FEMALE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ sexdstnCode: 'F' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].gender).toBe('FEMALE');
    });

    it('알 수 없는 sexdstnCode → UNKNOWN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ sexdstnCode: 'X' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].gender).toBe('UNKNOWN');
    });
  });

  describe('photoUrl 처리', () => {
    it('filePathNm 있으면 photoUrl 설정', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ filePathNm: 'https://img.safe182.go.kr/img.jpg' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].photoUrl).toBe('https://img.safe182.go.kr/img.jpg');
    });

    it('filePathNm 빈 문자열이면 photoUrl이 undefined', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ filePathNm: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].photoUrl).toBeUndefined();
    });
  });

  describe('age 계산', () => {
    it('birthYmd로 나이 계산 (예: 2010년생 → "16세" 근처)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ birthYmd: '20100515' })])),
      });

      const results = await safe182Fetcher.fetch();

      // 현재 연도(2026) - 2010 = 16
      expect(results[0].age).toBe('16세');
    });

    it('birthYmd 비어있으면 age가 undefined', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ birthYmd: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].age).toBeUndefined();
    });
  });

  describe('날짜 파싱', () => {
    it('mssgnYmd "20250115" → 2025-01-15 Date', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeMissingChildItem({ mssgnYmd: '20250115' })])),
      });

      const results = await safe182Fetcher.fetch();
      const d = results[0].lastSeenAt;

      expect(d).toBeInstanceOf(Date);
      expect(d.getUTCFullYear()).toBe(2025);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(15);
    });
  });

  describe('API 에러 처리', () => {
    it('4xx 응답 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve(({})),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('5xx 응답 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve(({})),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('네트워크 오류 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('items가 없는 응답 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: {
            body: {
              totalCount: 0,
              items: '',
            },
          },
        }),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('예상치 못한 응답 구조 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(({ error: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' })),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });
  });
});
