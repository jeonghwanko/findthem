import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';
import type { Gender } from '@findthem/shared';
import type { Fetcher, ExternalReport } from '../types.js';

const log = createLogger('crawl:safe182');

// Safe182 실종아동 찾기 직접 API (경찰청)
// Credentials: SAFE182_ESNTL_ID + SAFE182_API_KEY
const BASE_URL = 'https://www.safe182.go.kr/api/lcm/findChildList.do';
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 10_000;

interface Safe182Item {
  esntlId?: string;
  nm?: string;
  sexdstnDscd?: string;    // "여자" | "남자"
  age?: number;            // 당시나이
  occrAdres?: string;      // 발생장소
  occrde?: string;         // 발생일시 (yyyymmdd)
  alldressingDscd?: string; // 착의사항 (features)
}

function parseOccrde(ymd: string): Date {
  if (!ymd || ymd.length < 8) return new Date();
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return isNaN(date.getTime()) ? new Date() : date;
}

function mapSex(code: string | undefined): Gender {
  if (code === '남자') return 'MALE';
  if (code === '여자') return 'FEMALE';
  return 'UNKNOWN';
}

export const safe182Fetcher: Fetcher = {
  source: 'safe182',

  async fetch(): Promise<ExternalReport[]> {
    if (!config.safe182EsntlId || !config.safe182ApiKey) {
      log.warn('SAFE182_ESNTL_ID or SAFE182_API_KEY not set, skipping safe182 crawl');
      return [];
    }

    const results: ExternalReport[] = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while (results.length < totalCount && pageNo <= 10) {
      let res: Response;
      try {
        res = await fetch(BASE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            esntlId: config.safe182EsntlId,
            authKey: config.safe182ApiKey,
            rowSize: String(PAGE_SIZE),
            page: String(pageNo),
          }).toString(),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        log.error({ pageNo, err }, 'safe182 fetch error');
        break;
      }

      if (!res.ok) {
        log.error({ pageNo, status: res.status }, 'safe182 non-200 response');
        break;
      }

      const raw = (await res.json()) as Record<string, unknown>;
      const result = raw['result'] as string | undefined;
      if (result !== '00') {
        log.warn({ result, msg: raw['msg'], pageNo }, 'safe182 non-OK result code');
        break;
      }

      totalCount = (raw['totalCount'] as number) ?? 0;
      const list: Safe182Item[] = Array.isArray(raw['list']) ? (raw['list'] as Safe182Item[]) : [];
      if (list.length === 0) break;

      for (const item of list) {
        if (!item.esntlId) {
          log.warn({ nm: item.nm }, 'safe182 item missing esntlId, skipping');
          continue;
        }
        results.push({
          externalId: item.esntlId,
          subjectType: 'PERSON',
          name: item.nm || '이름 미상',
          features: item.alldressingDscd || '특징 정보 없음',
          lastSeenAt: parseOccrde(item.occrde ?? ''),
          lastSeenAddress: item.occrAdres || '장소 미상',
          gender: mapSex(item.sexdstnDscd),
          age: item.age !== undefined ? `${item.age}세` : undefined,
        });
      }

      pageNo++;
    }

    log.info({ count: results.length }, 'safe182 fetch complete');
    return results;
  },
};
