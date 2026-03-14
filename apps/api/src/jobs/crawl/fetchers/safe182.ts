import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { Fetcher, ExternalReport } from '../types.js';

const log = createLogger('crawl:safe182');

// 경찰청 Safe182 실종아동 찾기 API
// 공공데이터포털: https://www.data.go.kr/data/15000390/openapi.do
const BASE_URL = 'http://apis.data.go.kr/B550034/missingChildInfoService/getMissingChildList';
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 10_000;

interface MissingChildItem {
  msspsnIdntfccd: string;
  msspsnNm: string;
  sexdstnCode: string;
  birthYmd: string;
  mssgnArCn: string;
  mssgnYmd: string;
  writngTelno: string;
  writngInstNm: string;
  physclcd: string;
  filePathNm: string;
}

function parseMssgnYmd(ymd: string): Date {
  if (!ymd || ymd.length < 8) return new Date();
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  return isNaN(date.getTime()) ? new Date() : date;
}

function mapSex(code: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (code === 'M') return 'MALE';
  if (code === 'F') return 'FEMALE';
  return 'UNKNOWN';
}

function calcAge(birthYmd: string): string | undefined {
  if (!birthYmd || birthYmd.length < 4) return undefined;
  const birthYear = parseInt(birthYmd.slice(0, 4), 10);
  if (isNaN(birthYear)) return undefined;
  return `${new Date().getFullYear() - birthYear}세`;
}

export const safe182Fetcher: Fetcher = {
  source: 'safe182',

  async fetch(): Promise<ExternalReport[]> {
    if (!config.publicDataApiKey) {
      log.warn('PUBLIC_DATA_API_KEY not set, skipping safe182 crawl');
      return [];
    }

    const results: ExternalReport[] = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while (results.length < totalCount && pageNo <= 10) {
      const url = new URL(BASE_URL);
      url.searchParams.set('serviceKey', config.publicDataApiKey);
      url.searchParams.set('_type', 'json');
      url.searchParams.set('numOfRows', String(PAGE_SIZE));
      url.searchParams.set('pageNo', String(pageNo));

      let res: Response;
      try {
        res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      } catch (err) {
        log.error({ pageNo, err }, 'safe182 fetch error');
        break;
      }

      if (!res.ok) {
        log.error({ pageNo, status: res.status }, 'safe182 non-200 response');
        break;
      }

      const raw: unknown = await res.json();
      const response = (raw as Record<string, unknown>)?.['response'] as Record<string, unknown> | undefined;
      const body = response?.['body'] as Record<string, unknown> | undefined;
      if (!body) {
        log.warn({ pageNo }, 'safe182 unexpected response structure');
        break;
      }

      totalCount = (body['totalCount'] as number) ?? 0;
      const itemsWrapper = body['items'];
      if (!itemsWrapper || itemsWrapper === '') break;

      const rawItem = (itemsWrapper as Record<string, unknown>)['item'];
      if (!rawItem) break;
      const items: MissingChildItem[] = Array.isArray(rawItem) ? rawItem : [rawItem as MissingChildItem];

      for (const item of items) {
        results.push({
          externalId: item.msspsnIdntfccd,
          subjectType: 'PERSON',
          name: item.msspsnNm || '이름 미상',
          features: item.physclcd || '특징 정보 없음',
          lastSeenAt: parseMssgnYmd(item.mssgnYmd),
          lastSeenAddress: item.mssgnArCn || '장소 미상',
          photoUrl: item.filePathNm || undefined,
          contactPhone: item.writngTelno || undefined,
          contactName: item.writngInstNm || undefined,
          gender: mapSex(item.sexdstnCode ?? ''),
          age: calcAge(item.birthYmd),
        });
      }

      pageNo++;
    }

    log.info({ count: results.length }, 'safe182 fetch complete');
    return results;
  },
};
