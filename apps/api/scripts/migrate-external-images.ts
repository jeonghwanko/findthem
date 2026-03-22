/**
 * 일회성 마이그레이션 스크립트
 * DB에 http:// 또는 https://로 저장된 크롤링 이미지를 로컬에 다운로드 후 경로 업데이트
 *
 * 실행: npx tsx apps/api/scripts/migrate-external-images.ts
 */

// dotenv를 스크립트 파일 위치 기준으로 명시적 로드해야 한다.
// top-level import 순서 문제를 피하기 위해 dotenv를 createRequire로 동기 실행한다.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv') as typeof import('dotenv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/api/.env 명시적 로드 (프로젝트 루트에서 실행해도 동작)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// dotenv 로드 완료 후 Prisma / 서비스 모듈 import
import { PrismaClient } from '@prisma/client';
import { imageService } from '../src/services/imageService.js';
import { createLogger } from '../src/logger.js';

const prisma = new PrismaClient();
const log = createLogger('migrate-external-images');

async function main() {
  log.info('외부 이미지 마이그레이션 시작');

  // http:// 또는 https://로 시작하는 Photo 전체 조회
  const externalPhotos = await prisma.photo.findMany({
    where: {
      OR: [
        { photoUrl: { startsWith: 'http://' } },
        { photoUrl: { startsWith: 'https://' } },
      ],
    },
    select: {
      id: true,
      reportId: true,
      photoUrl: true,
      thumbnailUrl: true,
    },
  });

  log.info({ total: externalPhotos.length }, '외부 URL 이미지 조회 완료');

  if (externalPhotos.length === 0) {
    log.info('마이그레이션할 이미지가 없습니다.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const photo of externalPhotos) {
    log.info({ photoId: photo.id, reportId: photo.reportId, url: photo.photoUrl }, '처리 시작');

    try {
      const result = await imageService.processAndSaveFromUrl('reports', photo.photoUrl);

      if (!result) {
        log.warn(
          { photoId: photo.id, url: photo.photoUrl },
          '이미지 다운로드 실패 — 스킵',
        );
        failCount++;
        continue;
      }

      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          photoUrl: result.photoUrl,
          thumbnailUrl: result.thumbnailUrl,
        },
      });

      log.info(
        {
          photoId: photo.id,
          newPhotoUrl: result.photoUrl,
          newThumbnailUrl: result.thumbnailUrl,
        },
        '업데이트 완료',
      );
      successCount++;
    } catch (err) {
      log.error({ err, photoId: photo.id, url: photo.photoUrl }, '처리 중 오류 — 스킵');
      failCount++;
    }
  }

  log.info(
    { total: externalPhotos.length, successCount, failCount },
    '마이그레이션 완료',
  );
}

main()
  .catch((err) => {
    log.error({ err }, '마이그레이션 스크립트 오류');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    log.info('DB 연결 종료');
  });
