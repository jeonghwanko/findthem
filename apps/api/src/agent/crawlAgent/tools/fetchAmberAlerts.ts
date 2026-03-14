import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { ExternalReport } from '../../../jobs/crawl/types.js';

const log = createLogger('crawlAgent:fetchAmberAlerts');

const BASE_URL = 'https://www.safe182.go.kr/api/lcm/amberList.do';
const FETCH_TIMEOUT_MS = 10_000;

interface AmberItem {
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

interface FetchAmberAlertsInput {
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

export async function fetchAmberAlerts(input: unknown): Promise<FetchResult> {
  const { pageNo, numOfRows = 50 } = input as FetchAmberAlertsInput;

  if (!config.safe182EsntlId || !config.safe182ApiKey) {
    log.warn('SAFE182_ESNTL_ID or SAFE182_API_KEY not configured, skipping fetch_amber_alerts');
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
    log.error({ pageNo, err }, 'fetch_amber_alerts network error');
    return { items: [], totalCount: 0, pageNo };
  }

  if (!res.ok) {
    log.error({ pageNo, status: res.status }, 'fetch_amber_alerts non-200 response');
    return { items: [], totalCount: 0, pageNo };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    log.error({ pageNo, err }, 'fetch_amber_alerts JSON parse error');
    return { items: [], totalCount: 0, pageNo };
  }

  const data = raw as Record<string, unknown>;
  const totalCount = (data['totCnt'] as number) ?? 0;
  const rawList = data['list'];
  const list: AmberItem[] = Array.isArray(rawList) ? rawList : [];

  const items: ExternalReport[] = list.map((item) => ({
    externalId: `amber-${item.esntlId ?? `${Date.now()}-${Math.random()}`}`,
    subjectType: 'PERSON' as const,
    name: item.nm || '이름 미상',
    features: item.physclSpclmtrDesc || '엠버경보 긴급 실종',
    lastSeenAt: parseLostYmd(item.lostYmd ?? ''),
    lastSeenAddress: item.lostPlc || '장소 미상',
    photoUrl: item.tknphotoPath || undefined,
    contactPhone: item.writngTelno || undefined,
    contactName: item.writngInstNm || undefined,
    gender: mapSex(item.sexdstnCd),
    age: calcAge(item.birthYmd),
  }));

  log.info({ pageNo, count: items.length, totalCount }, 'fetch_amber_alerts complete');
  return { items, totalCount, pageNo };
}
