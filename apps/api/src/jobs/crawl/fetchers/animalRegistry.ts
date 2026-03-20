import type { Gender } from '@findthem/shared';
import { config } from '../../../config.js';
import { createLogger } from '../../../logger.js';

// 농림축산식품부 동물등록 조회 API (v3)
// 공공데이터포털: https://www.data.go.kr/data/15121611/openapi.do
const BASE_URL = 'http://apis.data.go.kr/1543061/animalInfoSrvc_v3/animalInfo_v3';
const FETCH_TIMEOUT_MS = 10_000;

const log = createLogger('crawl:animalRegistry');

export interface AnimalRegistryResult {
  regNo: string;
  rfidCode: string;
  deviceType: 'INTERNAL' | 'EXTERNAL' | 'TAG';
  name: string;
  birthDate: string;
  gender: Gender;
  breed: string;
  neutered: boolean;
  jurisdiction: string;
  registeredAt: string;
}

interface AnimalInfoApiItem {
  regNo?: string;
  rfidCd?: string;
  registerGbCd?: string; // Y=내장칩, M=외장형, N=인식표
  dogNm?: string;
  birthday?: string;
  sexCd?: string; // M=수컷, F=암컷
  kindNm?: string;
  neuterYn?: string; // Y=중성화, N=미중성화
  orgNm?: string;
  registerDt?: string;
}

function mapDeviceType(code: string | undefined): 'INTERNAL' | 'EXTERNAL' | 'TAG' {
  if (code === 'Y') return 'INTERNAL';
  if (code === 'M') return 'EXTERNAL';
  return 'TAG';
}

function mapSexCode(code: string | undefined): Gender {
  if (code === 'M') return 'MALE';
  if (code === 'F') return 'FEMALE';
  return 'UNKNOWN';
}

export async function lookupAnimalRegistry(params: {
  regNo?: string;
  rfidCode?: string;
  ownerNm?: string;
  ownerBirth?: string;
}): Promise<AnimalRegistryResult | null> {
  if (!config.publicDataApiKey) {
    log.warn('PUBLIC_DATA_API_KEY not set, skipping animal registry lookup');
    return null;
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('serviceKey', config.publicDataApiKey);
  url.searchParams.set('_type', 'json');

  if (params.regNo) url.searchParams.set('regNo', params.regNo);
  if (params.rfidCode) url.searchParams.set('rfidCd', params.rfidCode);
  if (params.ownerNm) url.searchParams.set('ownerNm', params.ownerNm);
  if (params.ownerBirth) url.searchParams.set('ownerBirth', params.ownerBirth);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    log.error({ err, params }, 'animal registry lookup fetch error');
    return null;
  }

  if (!res.ok) {
    log.error({ status: res.status, params }, 'animal registry lookup non-200 response');
    return null;
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    log.error({ err, params }, 'animal registry lookup JSON parse error');
    return null;
  }

  const response = (raw as Record<string, unknown>)?.['response'] as Record<string, unknown> | undefined;
  const body = response?.['body'] as Record<string, unknown> | undefined;
  if (!body) {
    log.warn({ params }, 'animal registry lookup unexpected response structure');
    return null;
  }

  const itemsWrapper = body['items'];
  if (!itemsWrapper || itemsWrapper === '') {
    log.info({ params }, 'animal registry lookup returned no items');
    return null;
  }

  const rawItem = (itemsWrapper as Record<string, unknown>)['item'];
  if (!rawItem) {
    log.info({ params }, 'animal registry lookup item field missing');
    return null;
  }

  // API may return an array or a single object; take the first match
  const item: AnimalInfoApiItem = Array.isArray(rawItem)
    ? (rawItem[0] as AnimalInfoApiItem)
    : (rawItem as AnimalInfoApiItem);

  if (!item.regNo) {
    log.warn({ params }, 'animal registry lookup item missing regNo');
    return null;
  }

  const result: AnimalRegistryResult = {
    regNo: item.regNo,
    rfidCode: item.rfidCd ?? '',
    deviceType: mapDeviceType(item.registerGbCd),
    name: item.dogNm ?? '',
    birthDate: item.birthday ?? '',
    gender: mapSexCode(item.sexCd),
    breed: item.kindNm ?? '',
    neutered: item.neuterYn === 'Y',
    jurisdiction: item.orgNm ?? '',
    registeredAt: item.registerDt ?? '',
  };

  log.info({ regNo: result.regNo }, 'animal registry lookup success');
  return result;
}
