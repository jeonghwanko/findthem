import crypto from 'crypto';
import { NAVER_SEARCH_DISPLAY_SIZE, AI_PARSING_CONCURRENCY } from '@findthem/shared';
import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import { parseSocialPost } from '../../../ai/socialParsingAgent.js';
import type { Fetcher, ExternalReport } from '../types.js';

const log = createLogger('crawl:naver-search');

const CAFE_URL = 'https://openapi.naver.com/v1/search/cafearticle.json';
const BLOG_URL = 'https://openapi.naver.com/v1/search/blog.json';
const DISPLAY = NAVER_SEARCH_DISPLAY_SIZE;
const FETCH_TIMEOUT_MS = 10_000;

/** AI 파싱 동시 처리 제한 */
const AI_CONCURRENCY = AI_PARSING_CONCURRENCY;

/** AI 호출 전 제목/본문에서 실종 관련 신호가 있는지 사전 필터링 */
const RELEVANCE_KEYWORDS = /실종|잃어버|찾습니다|발견|보호중|유기|목격|주인.*찾/;

const SEARCH_QUERIES = [
  '실종 강아지', '잃어버린 강아지', '강아지 찾습니다',
  '실종 고양이', '잃어버린 고양이', '고양이 찾습니다',
  '유기견 발견', '유기묘 발견',
  '강아지 목격', '고양이 발견', '강아지 발견 보호중',
  '실종자 찾습니다', '실종 어르신',
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
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .trim();
}

function normalizeNaverUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.replace(/^m\./, '');
    u.search = '';
    return u.toString();
  } catch {
    return raw;
  }
}

function generateExternalId(url: string): string {
  return crypto.createHash('sha256').update(normalizeNaverUrl(url)).digest('hex');
}

function parsePostDate(dateStr?: string): Date {
  if (!dateStr || dateStr.length < 8) return new Date();
  if (dateStr.includes('-')) {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
  }
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

    // 1. 모든 키워드 병렬 검색 (BullMQ stall 방지)
    const queryResults = await Promise.all(
      SEARCH_QUERIES.map(async (query) => {
        const [cafeItems, blogItems] = await Promise.all([
          searchNaver(CAFE_URL, query),
          searchNaver(BLOG_URL, query),
        ]);
        return { cafeItems, blogItems };
      }),
    );

    // 2. URL 중복 제거 + 제목/본문 키워드 사전 필터링 (AI 호출 절감)
    const allItems: { item: NaverSearchItem; source: string }[] = [];
    const seenUrls = new Set<string>();

    for (const { cafeItems, blogItems } of queryResults) {
      for (const item of cafeItems) {
        const normalized = normalizeNaverUrl(item.link);
        if (seenUrls.has(normalized)) continue;
        if (!RELEVANCE_KEYWORDS.test(stripHtml(item.title)) && !RELEVANCE_KEYWORDS.test(stripHtml(item.description))) continue;
        seenUrls.add(normalized);
        allItems.push({ item, source: 'cafe' });
      }
      for (const item of blogItems) {
        const normalized = normalizeNaverUrl(item.link);
        if (seenUrls.has(normalized)) continue;
        if (!RELEVANCE_KEYWORDS.test(stripHtml(item.title)) && !RELEVANCE_KEYWORDS.test(stripHtml(item.description))) continue;
        seenUrls.add(normalized);
        allItems.push({ item, source: 'blog' });
      }
    }

    log.info({ totalItems: allItems.length, queries: SEARCH_QUERIES.length }, 'Naver search complete, starting AI parsing');

    // 3. AI 파싱
    const results = await parseItemsBatch(allItems);

    log.info({ parsed: results.length, filtered: allItems.length }, 'Naver search AI parsing complete');

    return results;
  },
};
