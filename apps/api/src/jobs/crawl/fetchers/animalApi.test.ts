import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// config mock — publicDataApiKey를 테스트별로 제어
vi.mock('../../../config.js', () => ({
  config: {
    publicDataApiKey: 'test-api-key',
  },
}));

// logger mock — 콘솔 출력 방지
vi.mock('../../../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { animalApiFetcher } from './animalApi.js';
import { config } from '../../../config.js';

// 공공 API 기본 응답 빌더
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

function makeAnimalItem(overrides: Record<string, string> = {}) {
  return {
    desertionNo: 'EXT-001',
    kindCd: '[개] 푸들',
    sexCd: 'M',
    age: '2023(년생)',
    colorCd: '갈색',
    specialMark: '왼쪽 귀에 점',
    happenDt: '20250115',
    happenPlace: '서울시 강남구',
    orgNm: '강남유기동물센터',
    careTel: '02-1234-5678',
    popfile: 'https://example.com/photo.jpg',
    weight: '5.0(kg)',
    ...overrides,
  };
}

describe('animalApiFetcher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API 키 없을 때', () => {
    it('publicDataApiKey가 빈 문자열이면 빈 배열 반환', async () => {
      // config를 직접 덮어써서 빈 키 상황 시뮬레이션
      (config as Record<string, unknown>).publicDataApiKey = '';

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const result = await animalApiFetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();

      // 복구
      (config as Record<string, unknown>).publicDataApiKey = 'test-api-key';
    });
  });

  describe('API URL 및 파라미터 검증', () => {
    it('올바른 URL과 파라미터로 fetch 호출', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem()])),
      });
      global.fetch = fetchSpy;

      await animalApiFetcher.fetch();

      expect(fetchSpy).toHaveBeenCalled();
      const calledUrl: string = fetchSpy.mock.calls[0][0] as string;

      expect(calledUrl).toContain('apis.data.go.kr');
      expect(calledUrl).toContain('abandonmentPublicSrvc');
      expect(calledUrl).toContain('serviceKey=test-api-key');
      expect(calledUrl).toContain('_type=json');
      expect(calledUrl).toContain('numOfRows=100');
      expect(calledUrl).toContain('pageNo=1');
      expect(calledUrl).toContain('state=protect');
    });
  });

  describe('정상 응답 파싱', () => {
    it('유기동물 API 응답을 ExternalReport[]로 변환', async () => {
      const item = makeAnimalItem();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([item])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results).toHaveLength(1);
      const report = results[0];
      expect(report.externalId).toBe('EXT-001');
      expect(report.subjectType).toBe('DOG');
      expect(report.features).toBe('왼쪽 귀에 점');
      expect(report.lastSeenAddress).toBe('서울시 강남구');
      expect(report.photoUrl).toBe('https://example.com/photo.jpg');
      expect(report.contactPhone).toBe('02-1234-5678');
      expect(report.contactName).toBe('강남유기동물센터');
      expect(report.color).toBe('갈색');
      expect(report.weight).toBe('5.0(kg)');
      expect(report.species).toBe('[개] 푸들');
    });

    it('단일 item이 배열이 아닌 객체로 반환되어도 처리', async () => {
      // API가 item을 배열이 아닌 객체로 반환하는 경우 (항목 1개일 때)
      const singleItemResponse = {
        response: {
          body: {
            totalCount: 1,
            items: {
              item: makeAnimalItem(), // 배열이 아닌 단일 객체
            },
          },
        },
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(singleItemResponse),
      });

      const results = await animalApiFetcher.fetch();

      expect(results).toHaveLength(1);
    });

    it('name 필드: 개는 "유기견 {desertionNo}" 형식', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ desertionNo: 'EXT-999', kindCd: '[개] 비글' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].name).toBe('유기견 EXT-999');
    });

    it('name 필드: 고양이는 "유기묘 {desertionNo}" 형식', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ desertionNo: 'EXT-888', kindCd: '[고양이] 코리안숏헤어' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].name).toBe('유기묘 EXT-888');
    });
  });

  describe('subjectType 매핑', () => {
    it('[개] 접두사 → DOG', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ kindCd: '[개] 푸들' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].subjectType).toBe('DOG');
    });

    it('[고양이] 접두사 → CAT', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ kindCd: '[고양이] 페르시안' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].subjectType).toBe('CAT');
    });

    it('기타 kindCd (예: [기타축종]) → skip (결과에 포함되지 않음)', async () => {
      // totalCount=1로 설정: loop가 1번만 실행되도록 (기타 아이템 skip → results.length=1 이지만
      // skip된 아이템 자체가 결과에 포함 안 됨을 검증)
      // totalCount를 실제 포함될 아이템 수(1)로 설정
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([
            makeAnimalItem({ kindCd: '[기타축종] 토끼' }),
            makeAnimalItem({ desertionNo: 'EXT-002', kindCd: '[개] 믹스견' }),
          ], 1)),  // totalCount=1 → 1개 이상 결과가 모이면 loop 종료
      });

      const results = await animalApiFetcher.fetch();

      // 기타 항목은 skip, 개 항목만 포함
      expect(results).toHaveLength(1);
      expect(results[0].subjectType).toBe('DOG');
    });
  });

  describe('gender 매핑', () => {
    it('sexCd "M" → MALE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ sexCd: 'M' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].gender).toBe('MALE');
    });

    it('sexCd "F" → FEMALE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ sexCd: 'F' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].gender).toBe('FEMALE');
    });

    it('sexCd "Q" (중성) → UNKNOWN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ sexCd: 'Q' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].gender).toBe('UNKNOWN');
    });

    it('sexCd 알 수 없는 값 → UNKNOWN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ sexCd: 'X' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].gender).toBe('UNKNOWN');
    });
  });

  describe('photoUrl 처리', () => {
    it('popfile 있으면 photoUrl 설정', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ popfile: 'https://example.com/img.jpg' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].photoUrl).toBe('https://example.com/img.jpg');
    });

    it('popfile 빈 문자열이면 photoUrl이 undefined', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ popfile: '' })])),
      });

      const results = await animalApiFetcher.fetch();

      expect(results[0].photoUrl).toBeUndefined();
    });
  });

  describe('API 에러 처리', () => {
    it('4xx 응답 → 빈 배열 반환 (에러 throw 없음)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve(({})),
      });

      await expect(animalApiFetcher.fetch()).resolves.toEqual([]);
    });

    it('5xx 응답 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve(({})),
      });

      await expect(animalApiFetcher.fetch()).resolves.toEqual([]);
    });

    it('네트워크 오류(fetch throw) → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(animalApiFetcher.fetch()).resolves.toEqual([]);
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

      await expect(animalApiFetcher.fetch()).resolves.toEqual([]);
    });

    it('예상치 못한 응답 구조 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(({ unexpected: 'structure' })),
      });

      await expect(animalApiFetcher.fetch()).resolves.toEqual([]);
    });
  });

  describe('날짜 파싱', () => {
    it('happenDt "20250115" → 2025-01-15 Date 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ happenDt: '20250115' })])),
      });

      const results = await animalApiFetcher.fetch();
      const d = results[0].lastSeenAt;

      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(0); // 0-indexed
      expect(d.getDate()).toBe(15);
    });

    it('happenDt 비어있으면 현재 날짜 근처 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeAnimalItem({ happenDt: '' })])),
      });

      const before = Date.now();
      const results = await animalApiFetcher.fetch();
      const after = Date.now();

      expect(results[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(results[0].lastSeenAt.getTime()).toBeLessThanOrEqual(after + 1000);
    });
  });
});
