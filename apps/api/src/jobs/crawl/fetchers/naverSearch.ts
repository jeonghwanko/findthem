import crypto from 'crypto';
import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import { parseSocialPost } from '../../../ai/socialParsingAgent.js';
import type { Fetcher, ExternalReport } from '../types.js';

const log = createLogger('crawl:naver-search');

const CAFE_URL = 'https://openapi.naver.com/v1/search/cafearticle.json';
const BLOG_URL = 'https://openapi.naver.com/v1/search/blog.json';
const DISPLAY = 30;
const FETCH_TIMEOUT_MS = 10_000;

/** AI 파싱 동시 처리 제한 (API 부하 방지) */
const AI_CONCURRENCY = 5;

const SEARCH_QUERIES = [
  // 실종/유기 신고
  '실종 강아지', '잃어버린 강아지', '강아지 찾습니다',
  '실종 고양이', '잃어버린 고양이', '고양이 찾습니다',
  '유기견 발견', '유기묘 발견',
  // 목격/발견 제보
  '강아지 목격', '고양이 발견', '강아지 발견 보호중',
  '길고양이 보호', '주인 찾습니다 강아지',
  // 사람 실종
  '실종자 찾습니다', '실종 어르신', '실종 아이',
];

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  postdate?: string;
  bloggername?: string;
  cafename?: string;
}

interface NaverSearchResponse {
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();
}

function generateExternalId(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
}

function parsePostDate(dateStr?: string): Date {
  if (!dateStr || dateStr.length < 8) return new Date();
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return isNaN(date.getTime()) ? new Date() : date;
}

async function searchNaver(
  endpoint: string,
  query: string,
): Promise<NaverSearchItem[]> {
  const url = new URL(endpoint);
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(DISPLAY));
  url.searchParams.set('sort', 'date');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': config.naverClientId,
        'X-Naver-Client-Secret': config.naverClientSecret,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      log.warn({ query, status: res.status, endpoint }, 'Naver API non-200');
      return [];
    }

    const data = (await res.json()) as NaverSearchResponse;
    return data.items ?? [];
  } catch (err) {
    log.error({ query, endpoint, err }, 'Naver API fetch error');
    return [];
  }
}

/** AI 파싱을 배치로 처리 (concurrency 제한) */
async function parseItemsBatch(
  items: { item: NaverSearchItem; source: string }[],
): Promise<ExternalReport[]> {
  const results: ExternalReport[] = [];

  for (let i = 0; i < items.length; i += AI_CONCURRENCY) {
    const batch = items.slice(i, i + AI_CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async ({ item, source }) => {
        const title = stripHtml(item.title);
        const desc = stripHtml(item.description);

        const result = await parseSocialPost(title, desc);
        if (!result) return null;

        const externalId = generateExternalId(item.link);

        const report: ExternalReport = {
          externalId,
          subjectType: result.subjectType,
          name: result.name,
          features: result.features,
          lastSeenAt: item.postdate ? parsePostDate(item.postdate) : new Date(result.estimatedDate),
          lastSeenAddress: result.location,
          photoUrl: result.photoUrl,
          contactName: source === 'cafe' ? item.cafename : item.bloggername,
        };

        return report;
      }),
    );

    for (const r of parsed) {
      if (r) results.push(r);
    }
  }

  return results;
}

export const naverSearchFetcher: Fetcher = {
  source: 'naver-search',

  async fetch(): Promise<ExternalReport[]> {
    if (!config.naverClientId || !config.naverClientSecret) {
      log.warn('NAVER_CLIENT_ID/SECRET not set, skipping naver-search crawl');
      return [];
    }

    // 모든 키워드로 카페 + 블로그 검색
    const allItems: { item: NaverSearchItem; source: string }[] = [];
    const seenUrls = new Set<string>();

    for (const query of SEARCH_QUERIES) {
      const [cafeItems, blogItems] = await Promise.all([
        searchNaver(CAFE_URL, query),
        searchNaver(BLOG_URL, query),
      ]);

      for (const item of cafeItems) {
        if (!seenUrls.has(item.link)) {
          seenUrls.add(item.link);
          allItems.push({ item, source: 'cafe' });
        }
      }
      for (const item of blogItems) {
        if (!seenUrls.has(item.link)) {
          seenUrls.add(item.link);
          allItems.push({ item, source: 'blog' });
        }
      }
    }

    log.info({ totalItems: allItems.length, queries: SEARCH_QUERIES.length }, 'Naver search complete, starting AI parsing');

    // AI로 실종 게시글 필터링 + 구조화
    const results = await parseItemsBatch(allItems);

    log.info({ parsed: results.length, total: allItems.length }, 'Naver search AI parsing complete');

    return results;
  },
};
