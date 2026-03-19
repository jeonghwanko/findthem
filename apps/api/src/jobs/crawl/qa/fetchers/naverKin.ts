import crypto from 'crypto';
import type { ExternalQuestion } from '@findthem/shared';
import { config } from '../../../../config.js';
import { createLogger } from '../../../../logger.js';
import type { QaFetcher } from '../types.js';

const log = createLogger('crawl:qa:naver-kin');

const KIN_URL = 'https://openapi.naver.com/v1/search/kin.json';
const DISPLAY = 20;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * 한국에서 질문이 많이 올라오는 카테고리의 검색 키워드.
 * 실종/반려동물/AI 관련 질문을 수집한다.
 */
const SEARCH_QUERIES = [
  '실종 신고 방법',
  '강아지 잃어버렸을때',
  '고양이 실종 어떻게',
  '실종자 찾는 방법',
  '유기동물 발견 신고',
  '반려동물 실종 대처',
  '미아 신고 절차',
  '실종 포스터 만들기',
];

interface NaverKinItem {
  title: string;
  link: string;
  description: string;
  postdate?: string;
}

interface NaverKinResponse {
  total: number;
  start: number;
  display: number;
  items: NaverKinItem[];
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

function generateExternalId(url: string): string {
  return crypto.createHash('sha256').update(normalizeUrl(url)).digest('hex');
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

async function searchKin(query: string): Promise<NaverKinItem[]> {
  const url = new URL(KIN_URL);
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
      log.warn({ query, status: res.status }, 'Naver Kin API non-200');
      return [];
    }

    const data = (await res.json()) as NaverKinResponse;
    return data.items ?? [];
  } catch (err) {
    log.error({ query, err }, 'Naver Kin API fetch error');
    return [];
  }
}

export const naverKinFetcher: QaFetcher = {
  source: 'naver-kin',

  async fetch(): Promise<ExternalQuestion[]> {
    if (!config.naverClientId || !config.naverClientSecret) {
      log.warn('NAVER_CLIENT_ID/SECRET not set, skipping naver-kin crawl');
      return [];
    }

    // 네이버 API rate limit 방지: 2개씩 배치 호출
    const BATCH_SIZE = 2;
    const queryResults: NaverKinItem[][] = [];
    for (let i = 0; i < SEARCH_QUERIES.length; i += BATCH_SIZE) {
      const batch = SEARCH_QUERIES.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((query) => searchKin(query)));
      queryResults.push(...results);
    }

    // URL 중복 제거
    const seenUrls = new Set<string>();
    const questions: ExternalQuestion[] = [];

    for (const items of queryResults) {
      for (const item of items) {
        const normalized = normalizeUrl(item.link);
        if (seenUrls.has(normalized)) continue;
        seenUrls.add(normalized);

        const title = stripHtml(item.title);
        const content = stripHtml(item.description);

        // 제목/내용이 너무 짧으면 스킵
        if (title.length < 5 || content.length < 10) continue;

        questions.push({
          externalId: generateExternalId(item.link),
          title,
          content,
          sourceUrl: normalized,
          sourceName: 'naver-kin',
          postedAt: parsePostDate(item.postdate),
        });
      }
    }

    log.info({ totalQuestions: questions.length, queries: SEARCH_QUERIES.length }, 'Naver Kin crawl complete');
    return questions;
  },
};
