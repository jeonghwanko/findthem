import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { ExternalReport } from '../../../jobs/crawl/types.js';

const log = createLogger('crawlAgent:fetchAnimalApi');

const BASE_URL = 'http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublic';
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

interface FetchAnimalApiInput {
  pageNo: number;
  numOfRows?: number;
  state?: 'protect' | 'notice' | 'all';
}

interface FetchResult {
  items: ExternalReport[];
  totalCount: number;
  pageNo: number;
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

export async function fetchAnimalApi(input: unknown): Promise<FetchResult> {
  const { pageNo, numOfRows = 50, state = 'protect' } = input as FetchAnimalApiInput;

  if (!config.publicDataApiKey) {
    log.warn('PUBLIC_DATA_API_KEY not configured, skipping fetch_animal_api');
    return { items: [], totalCount: 0, pageNo };
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('serviceKey', config.publicDataApiKey);
  url.searchParams.set('_type', 'json');
  url.searchParams.set('numOfRows', String(numOfRows));
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('state', state);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    log.error({ pageNo, err }, 'fetch_animal_api network error');
    return { items: [], totalCount: 0, pageNo };
  }

  if (!res.ok) {
    log.error({ pageNo, status: res.status }, 'fetch_animal_api non-200 response');
    return { items: [], totalCount: 0, pageNo };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    log.error({ pageNo, err }, 'fetch_animal_api JSON parse error');
    return { items: [], totalCount: 0, pageNo };
  }

  const response = (raw as Record<string, unknown>)?.['response'] as Record<string, unknown> | undefined;
  const body = response?.['body'] as Record<string, unknown> | undefined;

  if (!body) {
    log.warn({ pageNo }, 'fetch_animal_api unexpected response structure');
    return { items: [], totalCount: 0, pageNo };
  }

  const totalCount = (body['totalCount'] as number) ?? 0;
  const itemsWrapper = body['items'];
  if (!itemsWrapper || itemsWrapper === '') {
    return { items: [], totalCount, pageNo };
  }

  const rawItem = (itemsWrapper as Record<string, unknown>)['item'];
  if (!rawItem) {
    return { items: [], totalCount, pageNo };
  }

  const apiItems: AnimalApiItem[] = Array.isArray(rawItem) ? rawItem : [rawItem as AnimalApiItem];

  const items: ExternalReport[] = [];
  for (const item of apiItems) {
    const subjectType = mapKindToSubjectType(item.kindCd ?? '');
    if (!subjectType) continue;

    items.push({
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

  log.info({ pageNo, count: items.length, totalCount }, 'fetch_animal_api complete');
  return { items, totalCount, pageNo };
}
