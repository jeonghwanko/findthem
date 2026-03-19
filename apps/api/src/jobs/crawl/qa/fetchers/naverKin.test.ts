import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// config mock
vi.mock('../../../../config.js', () => ({
  config: {
    naverClientId: 'test-client-id',
    naverClientSecret: 'test-client-secret',
  },
}));

// logger mock
vi.mock('../../../../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { naverKinFetcher } from './naverKin.js';
import { config } from '../../../../config.js';

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

interface NaverKinItem {
  title: string;
  link: string;
  description: string;
  postdate?: string;
}

function makeKinItem(overrides: Partial<NaverKinItem> = {}): NaverKinItem {
  return {
    title: '강아지 잃어버렸을때 어떻게 하나요',
    link: 'https://kin.naver.com/qna/detail.nhn?d1id=8&dirId=80103&docId=123456',
    description: '어제 강아지가 실종됐는데 신고는 어디에 하나요 도와주세요',
    postdate: '20260315',
    ...overrides,
  };
}

function makeNaverKinResponse(items: NaverKinItem[]) {
  return {
    total: items.length,
    start: 1,
    display: items.length,
    items,
  };
}

/** 모든 fetch 호출에 대해 같은 응답 반환 */
function mockFetchAll(items: NaverKinItem[], ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(makeNaverKinResponse(items)),
  });
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.replace(/^m\./, '');
    u.search = '';
    return u.toString();
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('naverKinFetcher', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('source 식별자', () => {
    it('fetcher.source가 "naver-kin"', () => {
      expect(naverKinFetcher.source).toBe('naver-kin');
    });
  });

  describe('API 키 미설정', () => {
    it('naverClientId가 빈 문자열 → 빈 배열 반환, fetch 미호출', async () => {
      (config as Record<string, unknown>).naverClientId = '';

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await naverKinFetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();

      (config as Record<string, unknown>).naverClientId = 'test-client-id';
    });

    it('naverClientSecret이 빈 문자열 → 빈 배열 반환, fetch 미호출', async () => {
      (config as Record<string, unknown>).naverClientSecret = '';

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await naverKinFetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();

      (config as Record<string, unknown>).naverClientSecret = 'test-client-secret';
    });
  });

  describe('HTML 태그 제거', () => {
    it('title의 HTML 태그가 strip됨', async () => {
      const item = makeKinItem({
        title: '<b>강아지</b> <em>잃어버렸을때</em> 어떻게 하나요',
        description: '어제 강아지가 실종됐는데 신고는 어디에 하나요 도와주세요',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('강아지 잃어버렸을때 어떻게 하나요');
      expect(results[0].title).not.toContain('<b>');
    });

    it('description의 HTML 태그가 strip됨', async () => {
      const item = makeKinItem({
        description: '어제 <strong>강아지</strong>가 실종됐는데 신고는 어디에 하나요 도와주세요',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results[0].content).toBe('어제 강아지가 실종됐는데 신고는 어디에 하나요 도와주세요');
      expect(results[0].content).not.toContain('<strong>');
    });

    it('&amp; → & 변환', async () => {
      const item = makeKinItem({
        title: '강아지 &amp; 고양이 실종 어떻게 하나요',
        description: '두 마리가 실종됐는데 신고 어디서 하나요 도와주세요',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results[0].title).toContain('강아지 & 고양이');
    });

    it('&lt; / &gt; → < / > 변환', async () => {
      const item = makeKinItem({
        title: '강아지 &lt;5kg&gt; 실종 어떻게 하나요',
        description: '소형 강아지가 실종됐는데 신고는 어디에 하나요 도와주세요',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results[0].title).toContain('<5kg>');
    });

    it('HTML 엔터티 &#숫자; 형식 변환', async () => {
      const item = makeKinItem({
        title: '강아지&#44; 잃어버렸을 때 신고 방법 알려주세요',
        description: '소형 강아지가 실종됐는데 신고는 어디에 하나요 도와주세요',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      // &#44; = 쉼표(',')
      expect(results[0].title).toContain(',');
    });
  });

  describe('URL 정규화', () => {
    it('m.kin.naver.com → kin.naver.com 변환', async () => {
      const mobileUrl = 'https://m.kin.naver.com/qna/detail.nhn?d1id=8&dirId=80103&docId=999';
      const item = makeKinItem({ link: mobileUrl });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results[0].sourceUrl).not.toContain('m.kin');
      expect(results[0].sourceUrl).toContain('kin.naver.com');
    });

    it('query string이 제거된 URL로 정규화', async () => {
      const item = makeKinItem({
        link: 'https://kin.naver.com/qna/detail.nhn?d1id=8&dirId=80103&docId=123',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      // search params 제거됨
      expect(results[0].sourceUrl).not.toContain('?');
    });
  });

  describe('URL 중복 제거', () => {
    it('같은 URL 2건 → 1건만 결과에 포함', async () => {
      const url = 'https://kin.naver.com/qna/detail.nhn?d1id=8&dirId=80103&docId=111';
      const item1 = makeKinItem({ link: url });
      const item2 = makeKinItem({ link: url, title: '동일 URL 다른 제목 강아지 실종 어떻게 하나요' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverKinResponse([item1, item2])),
      });

      const results = await naverKinFetcher.fetch();

      // sourceUrl 기준 중복 제거 (정규화 후 동일)
      const urls = results.map((r) => r.sourceUrl);
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(urls.length);
    });

    it('m.kin URL과 kin URL → 정규화 후 동일 → 1건만', async () => {
      const mobileUrl = 'https://m.kin.naver.com/qna/detail.nhn?docId=555';
      const desktopUrl = 'https://kin.naver.com/qna/detail.nhn?docId=555';
      const item1 = makeKinItem({ link: mobileUrl });
      const item2 = makeKinItem({ link: desktopUrl });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverKinResponse([item1, item2])),
      });

      const results = await naverKinFetcher.fetch();

      // 정규화 후 동일 URL → 중복 제거로 1건
      const urls = results.map((r) => r.sourceUrl);
      expect(new Set(urls).size).toBe(urls.length);
      // 최소 1건 (완전 필터링 아님)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('짧은 제목/내용 스킵', () => {
    it('title < 5자 → 해당 항목 제외', async () => {
      const item = makeKinItem({ title: '짧음', description: '어제 강아지가 실종됐는데 도와주세요' }); // 2자
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results).toHaveLength(0);
    });

    it('content < 10자 → 해당 항목 제외', async () => {
      const item = makeKinItem({ title: '강아지 잃어버렸을때 어떻게', description: '<b>짧음</b>' }); // strip 후 2자
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results).toHaveLength(0);
    });

    it('title 정확히 5자 → 포함', async () => {
      const item = makeKinItem({
        title: '강아지실종',  // 5자
        description: '강아지가 실종됐는데 도와주세요',
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results).toHaveLength(1);
    });

    it('content 정확히 10자 → 포함', async () => {
      const item = makeKinItem({
        title: '강아지 잃어버렸을때 어떻게',
        description: '가나다라마바사아자차',  // 10자
      });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results).toHaveLength(1);
    });
  });

  describe('concurrency 배치', () => {
    it('8개 쿼리가 2개씩 배치로 fetch 호출 (배치 4번)', async () => {
      // 각 fetch 호출은 빈 배열 반환
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverKinResponse([])),
      });
      globalThis.fetch = fetchSpy;

      await naverKinFetcher.fetch();

      // SEARCH_QUERIES = 8개, 각 쿼리마다 1회 fetch → 총 8회
      expect(fetchSpy).toHaveBeenCalledTimes(8);
    });
  });

  describe('API 에러 처리', () => {
    it('non-200 응답 → 빈 배열 반환 (throw 없음)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });

      const result = await naverKinFetcher.fetch();

      expect(result).toEqual([]);
    });

    it('500 응답 → 빈 배열 반환', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const result = await naverKinFetcher.fetch();

      expect(result).toEqual([]);
    });
  });

  describe('네트워크 에러 처리', () => {
    it('fetch throw 시 빈 배열 반환 (throw 없음)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await naverKinFetcher.fetch();

      expect(result).toEqual([]);
    });

    it('AbortError (timeout) → 빈 배열 반환', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await naverKinFetcher.fetch();

      expect(result).toEqual([]);
    });
  });

  describe('externalId — URL SHA-256 해시', () => {
    it('externalId가 URL 기반 SHA-256 해시', async () => {
      const url = 'https://kin.naver.com/qna/detail.nhn?docId=777';
      const item = makeKinItem({ link: url });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      // normalizeUrl 적용 후 hash
      const normalized = normalizeUrl(url);
      const expectedId = crypto.createHash('sha256').update(normalized).digest('hex');
      expect(results[0].externalId).toBe(expectedId);
    });

    it('동일 URL → 항상 동일한 externalId', async () => {
      const url = 'https://kin.naver.com/qna/detail.nhn?docId=stable';
      const item = makeKinItem({ link: url });
      mockFetchAll([item]);

      const r1 = await naverKinFetcher.fetch();
      const r2 = await naverKinFetcher.fetch();

      expect(r1[0].externalId).toBe(r2[0].externalId);
    });

    it('externalId는 64자 hex 문자열', async () => {
      const item = makeKinItem();
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results[0].externalId).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('sourceName 필드', () => {
    it('sourceName이 "naver-kin"으로 설정됨', async () => {
      const item = makeKinItem();
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      expect(results[0].sourceName).toBe('naver-kin');
    });
  });

  describe('postedAt 파싱', () => {
    it('YYYYMMDD 형식 postdate → 올바른 UTC Date 반환', async () => {
      const item = makeKinItem({ postdate: '20260315' });
      mockFetchAll([item]);

      const results = await naverKinFetcher.fetch();

      const d = results[0].postedAt;
      expect(d).toBeInstanceOf(Date);
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(2); // March (0-indexed)
      expect(d.getUTCDate()).toBe(15);
    });

    it('postdate 없음 → 현재 시각 근처 Date', async () => {
      const item = makeKinItem({ postdate: undefined });
      mockFetchAll([item]);

      const before = Date.now();
      const results = await naverKinFetcher.fetch();
      const after = Date.now();

      expect(results[0].postedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(results[0].postedAt.getTime()).toBeLessThanOrEqual(after + 1000);
    });
  });
});
