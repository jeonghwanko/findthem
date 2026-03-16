import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// config mock
vi.mock('../../../config.js', () => ({
  config: {
    naverClientId: 'test-client-id',
    naverClientSecret: 'test-client-secret',
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

// socialParsingAgent mock
vi.mock('../../../ai/socialParsingAgent.js', () => ({
  parseSocialPost: vi.fn(),
}));

import { naverSearchFetcher } from './naverSearch.js';
import { config } from '../../../config.js';
import { parseSocialPost } from '../../../ai/socialParsingAgent.js';

const mockParseSocialPost = vi.mocked(parseSocialPost);

// ---------------------------------------------------------------------------
// 타입 및 헬퍼 함수
// ---------------------------------------------------------------------------

interface NaverItem {
  title: string;
  link: string;
  description: string;
  postdate?: string;
  bloggername?: string;
  cafename?: string;
}

function makeBlogItem(overrides: Partial<NaverItem> = {}): NaverItem {
  return {
    title: '강아지 잃어버렸어요 실종',
    link: 'https://blog.naver.com/user/123',
    description: '어제 마포구에서 강아지를 실종했습니다 찾습니다',
    postdate: '20260315',
    bloggername: '블로그주인',
    ...overrides,
  };
}

function makeCafeItem(overrides: Partial<NaverItem> = {}): NaverItem {
  return {
    title: '강아지 실종 찾습니다',
    link: 'https://cafe.naver.com/petlove/456',
    description: '실종 강아지 목격하신 분 연락주세요',
    postdate: '20260315',
    cafename: '강아지카페',
    ...overrides,
  };
}

function makeNaverResponse(items: NaverItem[], overrides: Record<string, unknown> = {}) {
  return {
    total: items.length,
    start: 1,
    display: items.length,
    items,
    ...overrides,
  };
}

/** fetch를 성공 응답으로 설정. cafe와 blog 각각 다른 항목 반환. */
function mockFetchSuccess(cafeItems: NaverItem[], blogItems: NaverItem[]) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    const isCafe = (url as string).includes('cafearticle');
    const items = isCafe ? cafeItems : blogItems;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeNaverResponse(items)),
    });
  });
}

/** 기본 ParsedSocialPost 응답 */
const defaultParsed = {
  subjectType: 'DOG' as const,
  name: '초코',
  features: '갈색 말티즈',
  location: '서울시 마포구',
  estimatedDate: '2026-03-15',
  photoUrl: 'https://example.com/photo.jpg',
};

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('naverSearchFetcher', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseSocialPost.mockResolvedValue(null);
  });

  describe('API 키 미설정', () => {
    it('naverClientId가 빈 문자열이면 빈 배열 반환, fetch 미호출', async () => {
      (config as Record<string, unknown>).naverClientId = '';

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await naverSearchFetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();

      (config as Record<string, unknown>).naverClientId = 'test-client-id';
    });

    it('naverClientSecret이 빈 문자열이면 빈 배열 반환, fetch 미호출', async () => {
      (config as Record<string, unknown>).naverClientSecret = '';

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await naverSearchFetcher.fetch();

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();

      (config as Record<string, unknown>).naverClientSecret = 'test-client-secret';
    });
  });

  describe('Naver API 호출 헤더 검증', () => {
    it('X-Naver-Client-Id / X-Naver-Client-Secret 헤더로 fetch 호출', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverResponse([])),
      });
      globalThis.fetch = fetchSpy;

      await naverSearchFetcher.fetch();

      expect(fetchSpy).toHaveBeenCalled();
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['X-Naver-Client-Id']).toBe('test-client-id');
      expect(headers['X-Naver-Client-Secret']).toBe('test-client-secret');
    });

    it('카페 검색 URL과 블로그 검색 URL 모두 호출', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverResponse([])),
      });
      globalThis.fetch = fetchSpy;

      await naverSearchFetcher.fetch();

      const calledUrls = fetchSpy.mock.calls.map(([url]) => url as string);
      expect(calledUrls.some((u) => u.includes('cafearticle'))).toBe(true);
      expect(calledUrls.some((u) => u.includes('blog'))).toBe(true);
    });
  });

  describe('HTML 태그 제거 및 HTML 엔터티 변환', () => {
    it('HTML 태그를 제거하고 parseSocialPost에 순수 텍스트 전달', async () => {
      const item = makeBlogItem({
        title: '<b>강아지</b> 실종 <em>찾습니다</em>',
        description: '어제 <strong>마포구</strong>에서 실종했습니다 찾습니다',
      });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).toHaveBeenCalledWith(
        '강아지 실종 찾습니다',
        '어제 마포구에서 실종했습니다 찾습니다',
      );
    });

    it("&#39; → ' (작은따옴표) 변환", async () => {
      const item = makeBlogItem({
        title: "강아지&#39;s 실종 찾습니다",
        description: '실종 찾습니다',
      });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      await naverSearchFetcher.fetch();

      const [title] = mockParseSocialPost.mock.calls[0];
      expect(title).toBe("강아지's 실종 찾습니다");
    });

    it('&amp; → & 변환', async () => {
      const item = makeBlogItem({
        title: '강아지 &amp; 고양이 실종 찾습니다',
        description: '실종 찾습니다',
      });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      await naverSearchFetcher.fetch();

      const [title] = mockParseSocialPost.mock.calls[0];
      expect(title).toBe('강아지 & 고양이 실종 찾습니다');
    });

    it('&lt; / &gt; → < / > 변환', async () => {
      const item = makeBlogItem({
        title: '강아지 실종 &lt;3kg&gt; 찾습니다',
        description: '실종 찾습니다',
      });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      await naverSearchFetcher.fetch();

      const [title] = mockParseSocialPost.mock.calls[0];
      expect(title).toContain('<3kg>');
    });
  });

  describe('RELEVANCE_KEYWORDS 사전 필터링', () => {
    it('실종 관련 키워드 없는 항목 → parseSocialPost 미호출', async () => {
      const irrelevantItem = makeBlogItem({
        title: '오늘 날씨가 정말 좋네요',
        description: '봄 나들이 후기입니다',
      });
      mockFetchSuccess([], [irrelevantItem]);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).not.toHaveBeenCalled();
    });

    it('"실종" 키워드 포함 → parseSocialPost 호출됨', async () => {
      const item = makeBlogItem({ title: '실종된 강아지', description: '도와주세요' });
      mockFetchSuccess([], [item]);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).toHaveBeenCalled();
    });

    it('"찾습니다" 키워드가 description에만 있어도 → parseSocialPost 호출됨', async () => {
      const item = makeBlogItem({
        title: '우리 강아지',
        description: '어디에 있나요 찾습니다',
      });
      mockFetchSuccess([], [item]);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).toHaveBeenCalled();
    });

    it('"발견" 키워드 포함 → parseSocialPost 호출됨', async () => {
      const item = makeBlogItem({
        title: '유기견 발견했습니다',
        description: '보호중입니다',
      });
      mockFetchSuccess([], [item]);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).toHaveBeenCalled();
    });
  });

  describe('URL 중복 제거', () => {
    it('m.blog.naver.com과 blog.naver.com은 동일 URL → parseSocialPost 1번만 호출', async () => {
      const item1 = makeBlogItem({ link: 'https://m.blog.naver.com/user/123' });
      const item2 = makeBlogItem({ link: 'https://blog.naver.com/user/123' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverResponse([item1, item2])),
      });
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).toHaveBeenCalledTimes(1);
    });

    it('다른 링크를 가진 항목들 → 각각 parseSocialPost 호출', async () => {
      const item1 = makeBlogItem({ link: 'https://blog.naver.com/user/111' });
      const item2 = makeBlogItem({ link: 'https://blog.naver.com/user/222' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverResponse([item1, item2])),
      });
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      await naverSearchFetcher.fetch();

      expect(mockParseSocialPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('externalId 생성 (URL → SHA-256 해시)', () => {
    it('동일 URL → 항상 동일한 externalId', async () => {
      const url = 'https://blog.naver.com/user/stable123';
      const item = makeBlogItem({ link: url });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      const results = await naverSearchFetcher.fetch();

      const expectedId = crypto.createHash('sha256').update(url).digest('hex');
      expect(results[0].externalId).toBe(expectedId);
    });

    it('m.blog URL → m. 제거 후 정규화된 URL 기반 해시', async () => {
      const mobileUrl = 'https://m.blog.naver.com/user/stable123';
      const desktopUrl = 'https://blog.naver.com/user/stable123';
      const item = makeBlogItem({ link: mobileUrl });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      const results = await naverSearchFetcher.fetch();

      const expectedId = crypto.createHash('sha256').update(desktopUrl).digest('hex');
      expect(results[0].externalId).toBe(expectedId);
    });
  });

  describe('source별 contactName 매핑', () => {
    it('카페 항목 → cafename을 contactName으로 사용', async () => {
      const item = makeCafeItem({ cafename: '반려동물카페' });
      mockFetchSuccess([item], []);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      const results = await naverSearchFetcher.fetch();

      expect(results[0].contactName).toBe('반려동물카페');
    });

    it('블로그 항목 → bloggername을 contactName으로 사용', async () => {
      const item = makeBlogItem({ bloggername: '블로그주인닉네임' });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      const results = await naverSearchFetcher.fetch();

      expect(results[0].contactName).toBe('블로그주인닉네임');
    });
  });

  describe('Naver API 에러 처리', () => {
    it('4xx 응답 → 해당 쿼리 빈 결과 (throw 없음)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });

      await expect(naverSearchFetcher.fetch()).resolves.toEqual([]);
    });

    it('5xx 응답 → 빈 배열 반환', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(naverSearchFetcher.fetch()).resolves.toEqual([]);
    });

    it('fetch throw (네트워크 오류) → 빈 배열 반환', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(naverSearchFetcher.fetch()).resolves.toEqual([]);
    });

    it('AbortSignal timeout → 빈 배열 반환', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(naverSearchFetcher.fetch()).resolves.toEqual([]);
    });
  });

  describe('파싱 결과 → ExternalReport 매핑', () => {
    it('parseSocialPost 결과 필드가 ExternalReport로 정확히 매핑됨', async () => {
      const item = makeBlogItem({
        link: 'https://blog.naver.com/test/789',
        postdate: '20260310',
        bloggername: '테스트블로거',
      });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      const results = await naverSearchFetcher.fetch();

      expect(results).toHaveLength(1);
      const report = results[0];
      expect(report.subjectType).toBe('DOG');
      expect(report.name).toBe('초코');
      expect(report.features).toBe('갈색 말티즈');
      expect(report.lastSeenAddress).toBe('서울시 마포구');
      expect(report.photoUrl).toBe('https://example.com/photo.jpg');
      expect(report.contactName).toBe('테스트블로거');
    });

    it('parseSocialPost가 null 반환 → 결과에서 제외', async () => {
      mockFetchSuccess([], [makeBlogItem()]);
      mockParseSocialPost.mockResolvedValue(null);

      const results = await naverSearchFetcher.fetch();

      expect(results).toEqual([]);
    });

    it('postdate 있을 때 → lastSeenAt이 postdate 기반 Date', async () => {
      const item = makeBlogItem({ postdate: '20260310' });
      mockFetchSuccess([], [item]);
      mockParseSocialPost.mockResolvedValue(defaultParsed);

      const results = await naverSearchFetcher.fetch();

      const d = results[0].lastSeenAt;
      expect(d).toBeInstanceOf(Date);
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(2); // 0-indexed → March
      expect(d.getUTCDate()).toBe(10);
    });

    it('postdate 없을 때 → lastSeenAt이 estimatedDate 기반 Date', async () => {
      const item: NaverItem = {
        title: '강아지 실종 찾습니다',
        link: 'https://blog.naver.com/test/no-date',
        description: '실종된 강아지 찾습니다',
        bloggername: '테스터',
        // postdate 없음
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNaverResponse([item])),
      });
      mockParseSocialPost.mockResolvedValue({
        ...defaultParsed,
        estimatedDate: '2026-03-12',
      });

      const results = await naverSearchFetcher.fetch();

      const d = results[0].lastSeenAt;
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(2); // March
      expect(d.getDate()).toBe(12);
    });
  });

  describe('source 식별자', () => {
    it('fetcher.source 값이 "naver-search"', () => {
      expect(naverSearchFetcher.source).toBe('naver-search');
    });
  });
});

describe('parsePostDate (fetch를 통한 간접 검증)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('YYYYMMDD 형식 → 올바른 UTC Date 반환', async () => {
    const item = makeBlogItem({ postdate: '20260115' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeNaverResponse([item])),
    });
    mockParseSocialPost.mockResolvedValue(defaultParsed);

    const results = await naverSearchFetcher.fetch();

    const d = results[0].lastSeenAt;
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0); // January
    expect(d.getUTCDate()).toBe(15);
  });

  it('ISO 8601 형식 (YYYY-MM-DDTHH:mm:ssZ) → 올바른 Date 반환', async () => {
    const item = makeBlogItem({ postdate: '2026-02-20T09:00:00Z' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeNaverResponse([item])),
    });
    mockParseSocialPost.mockResolvedValue(defaultParsed);

    const results = await naverSearchFetcher.fetch();

    const d = results[0].lastSeenAt;
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(1); // February
    expect(d.getUTCDate()).toBe(20);
  });

  it('잘못된 날짜 문자열 → 현재 날짜 근처 반환', async () => {
    const item = makeBlogItem({ postdate: 'not-a-date-at-all' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeNaverResponse([item])),
    });
    mockParseSocialPost.mockResolvedValue(defaultParsed);

    const before = Date.now();
    const results = await naverSearchFetcher.fetch();
    const after = Date.now();

    expect(results[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(results[0].lastSeenAt.getTime()).toBeLessThanOrEqual(after + 1000);
  });
});
