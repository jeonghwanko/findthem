import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { ExternalReport } from '../../../jobs/crawl/types.js';

const log = createLogger('crawlAgent:fetchSafe182');

const BASE_URL = 'https://www.safe182.go.kr/api/lcm/findChildList.do';
const FETCH_TIMEOUT_MS = 10_000;

interface Safe182Item {
  esntlId?: string;
  nm?: string;
  sexdstnCd?: string;
  birthYmd?: string;
  writngTelno?: string;
  writngInstNm?: string;
  physclSpclmtrDesc?: string;
  lostPlc?: string;
  lostYmd?: string;
  tknphotoPath?: string;
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

function parseLostYmd(ymd: string): Date {
  if (!ymd || ymd.length < 8) return new Date();
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  return isNaN(date.getTime()) ? new Date() : date;
}

function mapSex(code: string | undefined): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (code === 'M') return 'MALE';
  if (code === 'F') return 'FEMALE';
  return 'UNKNOWN';
}

function calcAge(birthYmd: string | undefined): string | undefined {
  if (!birthYmd || birthYmd.length < 4) return undefined;
  const birthYear = parseInt(birthYmd.slice(0, 4), 10);
  if (isNaN(birthYear)) return undefined;
  return `${new Date().getFullYear() - birthYear}세`;
}

export async function fetchSafe182(input: unknown): Promise<FetchResult> {
  const { pageNo, numOfRows = 50 } = input as FetchSafe182Input;

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
        pageIndex: String(pageNo),
        pageUnit: String(numOfRows),
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
  const totalCount = (data['totCnt'] as number) ?? 0;
  const rawList = data['list'];
  const list: Safe182Item[] = Array.isArray(rawList) ? rawList : [];

  const items: ExternalReport[] = list.map((item) => ({
    externalId: item.esntlId ?? `safe182-${Date.now()}-${Math.random()}`,
    subjectType: 'PERSON' as const,
    name: item.nm || '이름 미상',
    features: item.physclSpclmtrDesc || '특징 정보 없음',
    lastSeenAt: parseLostYmd(item.lostYmd ?? ''),
    lastSeenAddress: item.lostPlc || '장소 미상',
    photoUrl: item.tknphotoPath || undefined,
    contactPhone: item.writngTelno || undefined,
    contactName: item.writngInstNm || undefined,
    gender: mapSex(item.sexdstnCd),
    age: calcAge(item.birthYmd),
  }));

  if (totalCount === 0) {
    log.warn({ pageNo, raw }, 'fetch_safe182 returned 0 total count');
  }
  log.info({ pageNo, count: items.length, totalCount }, 'fetch_safe182 complete');
  return { items, totalCount, pageNo };
}
