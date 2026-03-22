/**
 * 스플래시 이미지 생성 스크립트
 * - 아이콘 + 앱 이름 + 태그라인을 하나의 이미지로 결합
 * - @napi-rs/canvas 사용 — Windows 시스템 한글 폰트(맑은 고딕) 지원
 * - 아웃풋: resources/splash.png (2732×2732, iOS/Android 공용 소스)
 *
 * 실행: node scripts/generate-splash.mjs
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const WIDTH = 2732;
const HEIGHT = 2732;
const ICON_SIZE = 600;
const ICON_X = (WIDTH - ICON_SIZE) / 2;
const ICON_Y = HEIGHT / 2 - ICON_SIZE / 2 - 120;

// 아이콘 리사이즈 (PNG 버퍼)
const iconBuffer = await sharp(join(root, 'resources/icon.png'))
  .resize(ICON_SIZE, ICON_SIZE)
  .png()
  .toBuffer();

// Canvas 생성
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// 흰색 배경
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// 아이콘 그리기
const iconImg = await loadImage(iconBuffer);
ctx.drawImage(iconImg, ICON_X, ICON_Y, ICON_SIZE, ICON_SIZE);

// 앱 이름 — "찾아줘 - AI 탐정"
const titleY = ICON_Y + ICON_SIZE + 150;
ctx.font = 'bold 110px "Apple SD Gothic Neo", "맑은 고딕", "Malgun Gothic", "Noto Sans KR", sans-serif';
ctx.fillStyle = '#111827';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('찾아줘 - AI 탐정', WIDTH / 2, titleY);

// 태그라인 — "단서를 잇다."
const subY = titleY + 160;
ctx.font = '72px "Apple SD Gothic Neo", "맑은 고딕", "Malgun Gothic", "Noto Sans KR", sans-serif';
ctx.fillStyle = '#6b7280';
ctx.fillText('단서를 잇다.', WIDTH / 2, subY);

// PNG로 저장
const outPath = join(root, 'resources/splash.png');
const pngBuffer = canvas.toBuffer('image/png');
writeFileSync(outPath, pngBuffer);

console.log(`✓ ${outPath} 생성 완료 (${WIDTH}×${HEIGHT})`);
console.log('\n다음 명령으로 플랫폼별 splash 이미지 자동 생성:');
console.log('  npx @capacitor/assets generate --iconBackgroundColor #ffffff --splashBackgroundColor #ffffff');
