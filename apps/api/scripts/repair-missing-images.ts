/**
 * 이미지 복구 스크립트
 * DB에 /uploads/ 경로가 저장되어 있지만 실제 파일이 없는 크롤링 이미지를 복구한다.
 * 공공 API를 다시 호출하여 원본 URL(popfile1)을 가져온 뒤 로컬에 다운로드한다.
 *
 * 실행: npx tsx apps/api/scripts/repair-missing-images.ts
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv') as typeof import('dotenv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { imageService } from '../src/services/imageService.js';
import { createLogger } from '../src/logger.js';
import { config } from '../src/config.js';

const prisma = new PrismaClient();
const log = createLogger('repair-missing-images');

const UPLOAD_ROOT = path.resolve(config.uploadDir);

const BASE_URL = 'http://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2';
const PAGE_SIZE = 100;

interface AnimalApiItem {
  desertionNo: string;
  popfile1: string;
}

/** 공공 API에서 전체 보호중 목록을 가져와 desertionNo → popfile1 맵을 만든다 */
async function fetchPhotoMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!config.publicDataApiKey) {
    log.warn('PUBLIC_DATA_API_KEY not set');
    return map;
  }

  let pageNo = 1;
  let totalCount = Infinity;

  while (map.size < totalCount && pageNo <= 10) {
    const url = new URL(BASE_URL);
    url.searchParams.set('serviceKey', config.publicDataApiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', String(PAGE_SIZE));
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('state', 'protect');

    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) { log.warn({ pageNo, status: res.status }, 'API error'); break; }

      const raw = await res.json() as Record<string, unknown>;
      const response = raw['response'] as Record<string, unknown> | undefined;
      const body = response?.['body'] as Record<string, unknown> | undefined;
      if (!body) break;

      totalCount = (body['totalCount'] as number) ?? 0;
      const itemsWrapper = body['items'];
      if (!itemsWrapper || itemsWrapper === '') break;

      const rawItem = (itemsWrapper as Record<string, unknown>)['item'];
      if (!rawItem) break;
      const items: AnimalApiItem[] = Array.isArray(rawItem) ? rawItem : [rawItem as AnimalApiItem];

      for (const item of items) {
        if (item.popfile1) {
          map.set(item.desertionNo, item.popfile1);
        }
      }
      pageNo++;
    } catch (err) {
      log.error({ pageNo, err }, 'Fetch error');
      break;
    }
  }

  log.info({ count: map.size }, 'Photo URL map built from API');
  return map;
}

/** /uploads/... 경로의 실제 파일이 존재하는지 확인 */
async function fileExists(uploadPath: string): Promise<boolean> {
  const absPath = path.resolve(UPLOAD_ROOT, uploadPath.replace(/^\/uploads\//, ''));
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  log.info('이미지 복구 스크립트 시작');

  // 1. 크롤링으로 생성된 report 중 사진이 있는 것 조회
  const reports = await prisma.report.findMany({
    where: { externalSource: 'animal-api' },
    select: {
      id: true,
      externalId: true,
      photos: {
        select: { id: true, photoUrl: true, thumbnailUrl: true },
      },
    },
  });

  log.info({ totalReports: reports.length }, 'animal-api reports 조회');

  // 2. 파일이 실제로 없는 사진 찾기
  const missing: { reportId: string; photoId: string; externalId: string | null; photoUrl: string }[] = [];

  for (const r of reports) {
    for (const p of r.photos) {
      if (p.photoUrl.startsWith('/uploads/')) {
        const exists = await fileExists(p.photoUrl);
        if (!exists) {
          missing.push({ reportId: r.id, photoId: p.id, externalId: r.externalId, photoUrl: p.photoUrl });
        }
      }
    }
  }

  log.info({ missingCount: missing.length }, '파일 없는 사진 수');

  if (missing.length === 0) {
    log.info('복구할 이미지가 없습니다.');
    return;
  }

  // 3. 공공 API에서 원본 사진 URL 조회
  const photoMap = await fetchPhotoMap();

  let repaired = 0;
  let noSource = 0;
  let downloadFailed = 0;

  for (const item of missing) {
    if (!item.externalId) { noSource++; continue; }

    const originalUrl = photoMap.get(item.externalId);
    if (!originalUrl) {
      log.warn({ externalId: item.externalId }, 'API에서 원본 URL을 찾을 수 없음 (보호 종료된 항목일 수 있음)');
      noSource++;
      continue;
    }

    log.info({ externalId: item.externalId, originalUrl }, '다운로드 시도');

    const result = await imageService.processAndSaveFromUrl('reports', originalUrl);
    if (!result) {
      log.warn({ externalId: item.externalId, originalUrl }, '다운로드 실패');
      downloadFailed++;
      continue;
    }

    await prisma.reportPhoto.update({
      where: { id: item.photoId },
      data: {
        photoUrl: result.photoUrl,
        thumbnailUrl: result.thumbnailUrl,
      },
    });

    log.info({ externalId: item.externalId, newPhotoUrl: result.photoUrl }, '복구 완료');
    repaired++;
  }

  log.info({ total: missing.length, repaired, noSource, downloadFailed }, '이미지 복구 완료');
}

main()
  .catch((err) => {
    log.error({ err }, '스크립트 오류');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    log.info('DB 연결 종료');
  });
