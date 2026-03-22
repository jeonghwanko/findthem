/**
 * 사진 레코드 재생성 스크립트
 * schema_overhaul 마이그레이션에서 report_photo/sighting_photo → photo 통합 시
 * 데이터 이관이 누락되어 photo 레코드가 소실된 경우 사용.
 *
 * - animal-api 크롤링 report: 공공 API에서 원본 이미지 URL을 조회하여 재다운로드
 * - 사용자 업로드 sighting: uploads/sightings/ 파일을 스캔하여 매칭 시도
 *
 * 실행: npx tsx apps/api/scripts/rebuild-photos.ts
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

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
const log = createLogger('rebuild-photos');

const BASE_URL = 'http://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2';
const PAGE_SIZE = 100;
const CONCURRENCY = 5;
const DELAY_MS = 200;

interface AnimalApiItem {
  desertionNo: string;
  popfile1: string;
}

/** 공공 API에서 desertionNo → popfile1 맵 구축 (모든 상태) */
async function fetchPhotoMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!config.publicDataApiKey) {
    log.warn('PUBLIC_DATA_API_KEY not set — 크롤링 이미지 복구 불가');
    return map;
  }

  for (const state of ['protect', 'notice', 'end']) {
    let pageNo = 1;
    let totalCount = Infinity;

    while (map.size < totalCount && pageNo <= 50) {
      const url = new URL(BASE_URL);
      url.searchParams.set('serviceKey', config.publicDataApiKey);
      url.searchParams.set('_type', 'json');
      url.searchParams.set('numOfRows', String(PAGE_SIZE));
      url.searchParams.set('pageNo', String(pageNo));
      url.searchParams.set('state', state);

      try {
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) { log.warn({ pageNo, state, status: res.status }, 'API error'); break; }

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
        log.error({ pageNo, state, err }, 'Fetch error');
        break;
      }
    }

    log.info({ state, count: map.size }, 'Photo URL map progress');
  }

  log.info({ total: map.size }, 'Photo URL map 구축 완료');
  return map;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log.info('사진 레코드 재생성 스크립트 시작');

  // 1. photo 레코드가 없는 animal-api report 조회
  const reports = await prisma.report.findMany({
    where: {
      externalSource: 'animal-api',
      photos: { none: {} },
    },
    select: { id: true, externalId: true, name: true },
  });

  log.info({ count: reports.length }, 'photo 없는 animal-api reports');

  if (reports.length === 0) {
    log.info('복구할 report가 없습니다.');
    return;
  }

  // 2. 공공 API에서 이미지 URL 맵 구축
  const photoMap = await fetchPhotoMap();

  let created = 0;
  let noSource = 0;
  let downloadFailed = 0;

  // 3. 배치로 이미지 다운로드 + photo 레코드 생성
  for (let i = 0; i < reports.length; i += CONCURRENCY) {
    const batch = reports.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (report) => {
      if (!report.externalId) { noSource++; return; }

      const originalUrl = photoMap.get(report.externalId);
      if (!originalUrl) {
        noSource++;
        return;
      }

      try {
        const result = await imageService.processAndSaveFromUrl('reports', originalUrl);
        if (!result) {
          downloadFailed++;
          return;
        }

        await prisma.photo.create({
          data: {
            reportId: report.id,
            photoUrl: result.photoUrl,
            thumbnailUrl: result.thumbnailUrl,
            isPrimary: true,
          },
        });

        created++;
        if (created % 50 === 0) {
          log.info({ created, total: reports.length }, '진행 중');
        }
      } catch (err) {
        log.warn({ reportId: report.id, externalId: report.externalId, err }, '다운로드/저장 실패');
        downloadFailed++;
      }
    }));

    await sleep(DELAY_MS);
  }

  log.info({
    totalMissing: reports.length,
    created,
    noSource,
    downloadFailed,
  }, '사진 레코드 재생성 완료');
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
