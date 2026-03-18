/**
 * Playwright로 /dev/capture-heimi 페이지에서
 * 헤르미(promotion) 캐릭터를 각 사이즈별로 캡처하는 스크립트.
 *
 * 실행 전 dev 서버 필요: npm run dev:web
 * 실행: node scripts/capture-heimi.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../apps/web/public');

async function findDevPort() {
  for (const port of [5173, 5174, 5175, 5176, 5177]) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 404) return port;
    } catch { /* try next */ }
  }
  throw new Error('Vite dev 서버를 찾을 수 없습니다. npm run dev:web 실행 후 재시도하세요.');
}

const devPort = await findDevPort();
const DEV_URL = `http://localhost:${devPort}/dev/capture-heimi`;
console.log(`dev 서버 포트: ${devPort}`);

mkdirSync(OUT_DIR, { recursive: true });

const CAPTURES = [
  { className: 'heimi-32',  filename: 'heimi-32.webp',  size: 32 },
  { className: 'heimi-180', filename: 'heimi-180.webp', size: 180 },
  { className: 'heimi-630', filename: 'heimi-630.webp', size: 630 },
];

// 630px canvas가 들어갈 충분한 뷰포트 필요
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

console.log(`페이지 로딩: ${DEV_URL}`);
await page.goto(DEV_URL, { waitUntil: 'networkidle' });

// 캔버스 3개가 나타날 때까지 대기
await page.waitForSelector('canvas', { timeout: 15000 });

console.log('Spine 에셋 로드 대기 중...');
await page.waitForFunction(() => {
  const canvases = document.querySelectorAll('canvas');
  if (canvases.length < 3) return false;
  for (const canvas of canvases) {
    if (canvas.offsetWidth === 0) return false;
    const data = canvas.toDataURL('image/webp', 0.92);
    if (data.length < 500) return false;
  }
  return true;
}, { timeout: 30000, polling: 500 });

// 포즈 안정화 대기
await page.waitForTimeout(600);
console.log('렌더링 완료, 캡처 시작...');

for (let i = 0; i < CAPTURES.length; i++) {
  const { className, filename, size } = CAPTURES[i];

  const dataUrl = await page.evaluate((cls) => {
    const canvas = document.querySelector(`.${cls}`);
    if (!canvas) return null;
    return /** @type {HTMLCanvasElement} */ (canvas).toDataURL('image/webp', 0.92);
  }, className);

  if (!dataUrl || dataUrl.length < 500) {
    console.warn(`  ⚠️  ${filename}: 캔버스 비어있음 (${dataUrl?.length ?? 0}자) — 스킵`);
    continue;
  }

  const base64 = dataUrl.replace(/^data:image\/webp;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  const outPath = join(OUT_DIR, filename);
  writeFileSync(outPath, buf);
  console.log(`  ✓ ${filename} ${size}×${size} (${(buf.length / 1024).toFixed(1)} KB)`);
}

await browser.close();
console.log('\n완료! apps/web/public/ 에 파일이 저장됐습니다.');
