import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { Fetcher, ExternalReport } from '../types.js';

const log = createLogger('crawl:animal-api');

// 농림축산식품부 동물보호관리시스템 유기동물 API
// 공공데이터포털: https://www.data.go.kr/data/15098931/openapi.do
const BASE_URL = 'http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublic';
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 10_000;

interface AnimalApiItem {
  desertionNo: string;
  kindCd: string;
  sexCd: string;
  age: string;
  colorCd: string;
  specialMark: string;
  happenDt: string;
  happenPlace: string;
  orgNm: string;
  careTel: string;
  popfile: string;
  weight: string;
}

function mapKindToSubjectType(kindCd: string): 'DOG' | 'CAT' | null {
  if (kindCd.startsWith('[개]')) return 'DOG';
  if (kindCd.startsWith('[고양이]')) return 'CAT';
  return null;
}

function mapSexCode(sexCd: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (sexCd === 'M') return 'MALE';
  if (sexCd === 'F') return 'FEMALE';
  return 'UNKNOWN';
}

function parseHappenDt(dt: string): Date {
  if (!dt || dt.length < 8) return new Date();
  const y = dt.slice(0, 4);
  const m = dt.slice(4, 6);
  const d = dt.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  return isNaN(date.getTime()) ? new Date() : date;
}

export const animalApiFetcher: Fetcher = {
  source: 'animal-api',

  async fetch(): Promise<ExternalReport[]> {
    if (!config.publicDataApiKey) {
      log.warn('PUBLIC_DATA_API_KEY not set, skipping animal-api crawl');
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
      url.searchParams.set('state', 'protect');

      let res: Response;
      try {
        res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      } catch (err) {
        log.error({ pageNo, err }, 'animal-api fetch error');
        break;
      }

      if (!res.ok) {
        log.error({ pageNo, status: res.status }, 'animal-api non-200 response');
        break;
      }

      const raw: unknown = await res.json();
      const response = (raw as Record<string, unknown>)?.['response'] as Record<string, unknown> | undefined;
      const body = response?.['body'] as Record<string, unknown> | undefined;
      if (!body) {
        log.warn({ pageNo }, 'animal-api unexpected response structure');
        break;
      }

      totalCount = (body['totalCount'] as number) ?? 0;
      const itemsWrapper = body['items'];
      if (!itemsWrapper || itemsWrapper === '') break;

      const rawItem = (itemsWrapper as Record<string, unknown>)['item'];
      if (!rawItem) break;
      const items: AnimalApiItem[] = Array.isArray(rawItem) ? rawItem : [rawItem as AnimalApiItem];

      for (const item of items) {
        const subjectType = mapKindToSubjectType(item.kindCd ?? '');
        if (!subjectType) continue;

        results.push({
          externalId: item.desertionNo,
          subjectType,
          name: `유기${subjectType === 'DOG' ? '견' : '묘'} ${item.desertionNo}`,
          features: item.specialMark || `${item.colorCd ?? ''} ${item.kindCd ?? ''}`.trim() || '특징 미상',
          lastSeenAt: parseHappenDt(item.happenDt),
          lastSeenAddress: item.happenPlace || '장소 미상',
          photoUrl: item.popfile || undefined,
          contactPhone: item.careTel || undefined,
          contactName: item.orgNm || undefined,
          gender: mapSexCode(item.sexCd ?? ''),
          age: item.age || undefined,
          color: item.colorCd || undefined,
          weight: item.weight || undefined,
          species: item.kindCd || undefined,
        });
      }

      pageNo++;
    }

    log.info({ count: results.length }, 'animal-api fetch complete');
    return results;
  },
};
