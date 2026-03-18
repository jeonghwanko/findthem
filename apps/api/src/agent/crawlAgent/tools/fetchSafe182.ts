import { PUBLIC_API_DEFAULT_ROWS } from '@findthem/shared';
import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { ExternalReport } from '../../../jobs/crawl/types.js';

const log = createLogger('crawlAgent:fetchSafe182');

// Safe182 실종아동 찾기 직접 API (경찰청)
// Docs: https://www.safe182.go.kr → Open API
const BASE_URL = 'https://www.safe182.go.kr/api/lcm/findChildList.do';
const FETCH_TIMEOUT_MS = 10_000;

interface Safe182Item {
  esntlId?: string;
  nm?: string;
  sexdstnDscd?: string;    // "여자" | "남자"
  age?: number;            // 당시나이
  ageNow?: number;         // 현재나이
  occrAdres?: string;      // 발생장소
  occrde?: string;         // 발생일시 (yyyymmdd)
  writngTrgetDscd?: string; // 010=정상아동, 020=가출인, etc.
  alldressingDscd?: string; // 착의사항 (features)
}

interface FetchSafe182Input {
  pageNo: number;
  numOfRows?: number;
}

interface FetchResult {
  items: ExternalReport[];
  totalCount: number;
  pageNo: number;
}

function parseOccrde(ymd: string): Date {
  if (!ymd || ymd.length < 8) return new Date();
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return isNaN(date.getTime()) ? new Date() : date;
}

function mapSex(code: string | undefined): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (code === '남자') return 'MALE';
  if (code === '여자') return 'FEMALE';
  return 'UNKNOWN';
}

export async function fetchSafe182(input: unknown): Promise<FetchResult> {
  const { pageNo, numOfRows = PUBLIC_API_DEFAULT_ROWS } = input as FetchSafe182Input;

  if (!config.safe182EsntlId || !config.safe182ApiKey) {
    log.warn('SAFE182_ESNTL_ID or SAFE182_API_KEY not configured, skipping fetch_safe182');
    return { items: [], totalCount: 0, pageNo };
  }

  let res: Response;
  try {
    res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        esntlId: config.safe182EsntlId,
        authKey: config.safe182ApiKey,
        rowSize: String(numOfRows),  // max 100
        page: String(pageNo),
      }).toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    log.error({ pageNo, err }, 'fetch_safe182 network error');
    return { items: [], totalCount: 0, pageNo };
  }

  if (!res.ok) {
    log.error({ pageNo, status: res.status }, 'fetch_safe182 non-200 response');
    return { items: [], totalCount: 0, pageNo };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    log.error({ pageNo, err }, 'fetch_safe182 JSON parse error');
    return { items: [], totalCount: 0, pageNo };
  }

  const data = raw as Record<string, unknown>;
  const result = data['result'] as string | undefined;
  if (result !== '00') {
    log.warn({ result, msg: data['msg'], pageNo, raw }, 'fetch_safe182 non-OK result code');
    return { items: [], totalCount: 0, pageNo };
  }

  const totalCount = (data['totalCount'] as number) ?? 0;
  const list: Safe182Item[] = Array.isArray(data['list']) ? (data['list'] as Safe182Item[]) : [];

  const items: ExternalReport[] = list.map((item) => ({
    externalId: item.esntlId ?? `safe182-${Date.now()}-${Math.random()}`,
    subjectType: 'PERSON' as const,
    name: item.nm || '이름 미상',
    features: item.alldressingDscd || '특징 정보 없음',
    lastSeenAt: parseOccrde(item.occrde ?? ''),
    lastSeenAddress: item.occrAdres || '장소 미상',
    gender: mapSex(item.sexdstnDscd),
    age: item.age !== undefined ? `${item.age}세` : undefined,
  }));

  log.info({ pageNo, count: items.length, totalCount }, 'fetch_safe182 complete');
  return { items, totalCount, pageNo };
}
