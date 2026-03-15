import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config.js', () => ({
  config: {
    safe182EsntlId: 'test-esntl-id',
    safe182ApiKey: 'test-auth-key',
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
    result: '00',
    totalCount,
    list: items,
  };
}

function makeSafe182Item(overrides: Record<string, unknown> = {}) {
  return {
    esntlId: 'ID-001',
    nm: '홍길동',
    sexdstnDscd: '남자',
    age: 16,
    occrde: '20250115',
    occrAdres: '서울시 종로구 종로1가',
    alldressingDscd: '청바지 착용',
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
    (config as Record<string, unknown>).safe182EsntlId = 'test-esntl-id';
    (config as Record<string, unknown>).safe182ApiKey = 'test-auth-key';
  });

  describe('API 키 없을 때', () => {
    it('safe182EsntlId와 safe182ApiKey 모두 없으면 빈 배열 반환', async () => {
      (config as Record<string, unknown>).safe182EsntlId = '';
      (config as Record<string, unknown>).safe182ApiKey = '';

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const result = await safe182Fetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('safe182EsntlId만 없어도 빈 배열 반환', async () => {
      (config as Record<string, unknown>).safe182EsntlId = '';

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const result = await safe182Fetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('safe182ApiKey만 없어도 빈 배열 반환', async () => {
      (config as Record<string, unknown>).safe182ApiKey = '';

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const result = await safe182Fetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('API URL 및 파라미터 검증', () => {
    it('safe182.go.kr에 POST로 올바른 파라미터 전송', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item()])),
      });
      global.fetch = fetchSpy;

      await safe182Fetcher.fetch();

      expect(fetchSpy).toHaveBeenCalled();
      const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(calledUrl).toContain('safe182.go.kr');
      expect(calledUrl).toContain('findChildList.do');
      expect(calledOptions.method).toBe('POST');

      const body = calledOptions.body as string;
      expect(body).toContain('esntlId=test-esntl-id');
      expect(body).toContain('authKey=test-auth-key');
      expect(body).toContain('rowSize=');
      expect(body).toContain('page=1');
    });
  });

  describe('정상 응답 파싱', () => {
    it('실종아동 API 응답을 ExternalReport[]로 변환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item()])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results).toHaveLength(1);
      const report = results[0];
      expect(report.externalId).toBe('ID-001');
      expect(report.subjectType).toBe('PERSON');
      expect(report.name).toBe('홍길동');
      expect(report.features).toBe('청바지 착용');
      expect(report.lastSeenAddress).toBe('서울시 종로구 종로1가');
      expect(report.gender).toBe('MALE');
      expect(report.age).toBe('16세');
    });

    it('모든 항목의 subjectType은 PERSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([
          makeSafe182Item({ esntlId: 'P-001' }),
          makeSafe182Item({ esntlId: 'P-002' }),
        ], 2)),
      });

      const results = await safe182Fetcher.fetch();

      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.subjectType).toBe('PERSON'));
    });

    it('이름 없으면 "이름 미상" 사용', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ nm: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].name).toBe('이름 미상');
    });

    it('장소 없으면 "장소 미상" 사용', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ occrAdres: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].lastSeenAddress).toBe('장소 미상');
    });

    it('착의사항 없으면 "특징 정보 없음" 사용', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ alldressingDscd: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].features).toBe('특징 정보 없음');
    });

    it('photoUrl은 항상 undefined (safe182 API는 사진 미제공)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item()])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].photoUrl).toBeUndefined();
    });
  });

  describe('externalId 고유성', () => {
    it('각 항목의 externalId는 esntlId 값', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([
          makeSafe182Item({ esntlId: 'ID-AAA' }),
          makeSafe182Item({ esntlId: 'ID-BBB' }),
          makeSafe182Item({ esntlId: 'ID-CCC' }),
        ], 3)),
      });

      const results = await safe182Fetcher.fetch();

      const ids = results.map((r) => r.externalId);
      expect(ids).toEqual(['ID-AAA', 'ID-BBB', 'ID-CCC']);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('gender 매핑', () => {
    it('"남자" → MALE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ sexdstnDscd: '남자' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].gender).toBe('MALE');
    });

    it('"여자" → FEMALE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ sexdstnDscd: '여자' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].gender).toBe('FEMALE');
    });

    it('알 수 없는 값 → UNKNOWN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ sexdstnDscd: '' })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].gender).toBe('UNKNOWN');
    });
  });

  describe('age 처리', () => {
    it('age 숫자 필드 → "N세" 형식', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ age: 16 })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].age).toBe('16세');
    });

    it('age가 undefined이면 age 필드도 undefined', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ age: undefined })])),
      });

      const results = await safe182Fetcher.fetch();

      expect(results[0].age).toBeUndefined();
    });
  });

  describe('날짜 파싱', () => {
    it('occrde "20250115" → 2025-01-15 Date', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ occrde: '20250115' })])),
      });

      const results = await safe182Fetcher.fetch();
      const d = results[0].lastSeenAt;

      expect(d).toBeInstanceOf(Date);
      expect(d.getUTCFullYear()).toBe(2025);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(15);
    });

    it('occrde 비어있으면 현재 날짜 근처 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([makeSafe182Item({ occrde: '' })])),
      });

      const before = Date.now();
      const results = await safe182Fetcher.fetch();
      const after = Date.now();

      expect(results[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(results[0].lastSeenAt.getTime()).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('API 에러 처리', () => {
    it('4xx 응답 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('5xx 응답 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('네트워크 오류 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('result !== "00" → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: '99', msg: '필수항목 누락' }),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('list가 빈 배열 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: '00', totalCount: 0, list: [] }),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });

    it('예상치 못한 응답 구조 → 빈 배열 반환', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' }),
      });

      await expect(safe182Fetcher.fetch()).resolves.toEqual([]);
    });
  });
});
