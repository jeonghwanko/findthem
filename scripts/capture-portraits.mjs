/**
 * Playwright로 로컬 dev 서버의 /dev/portraits 페이지에서
 * 에이전트 썸네일을 캡처하는 스크립트.
 *
 * 실행 전 dev 서버 필요: npm run dev:web
 * 실행: node scripts/capture-portraits.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../apps/web/public/agents');
// Vite가 5173이 사용 중이면 자동으로 다음 포트 사용 — 자동 탐지
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
const DEV_URL = `http://localhost:${devPort}/dev/portraits`;
console.log(`dev 서버 포트: ${devPort}`);

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

console.log(`페이지 로딩: ${DEV_URL}`);
await page.goto(DEV_URL, { waitUntil: 'networkidle' });

// canvas 3개가 나타날 때까지 대기
await page.waitForSelector('canvas', { timeout: 15000 });

// Spine 에셋 로드 + 렌더링 대기 (preserveDrawingBuffer=true이므로 toDataURL 가능)
console.log('Spine 에셋 로드 대기 중...');
await page.waitForFunction(() => {
  const canvases = document.querySelectorAll('canvas');
  if (canvases.length < 3) return false;
  for (const canvas of canvases) {
    const ctx = canvas.getContext('2d');
    // WebGL canvas는 getContext('2d')가 null — 픽셀 데이터 확인 대신 width 체크
    if (canvas.offsetWidth === 0) return false;
  }
  // canvas.toDataURL()로 실제 픽셀 확인 (preserveDrawingBuffer=true 필요)
  const canvas = canvases[0];
  const data = canvas.toDataURL('image/png');
  // 빈 투명 PNG는 약 70~100자 수준의 base64
  return data.length > 500;
}, { timeout: 30000, polling: 500 });

// 포즈 안정화 대기
await page.waitForTimeout(600);
console.log('렌더링 완료, 캡처 시작...');

const AGENTS = ['image-matching', 'promotion', 'chatbot-alert'];

for (let i = 0; i < AGENTS.length; i++) {
  const dataUrl = await page.evaluate((idx) => {
    const canvas = document.querySelectorAll('canvas')[idx];
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }, i);

  if (!dataUrl || dataUrl.length < 500) {
    console.warn(`  ⚠️  ${AGENTS[i]}: 캔버스 비어있음 (${dataUrl?.length ?? 0}자) — 스킵`);
    continue;
  }

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  const outPath = join(OUT_DIR, `${AGENTS[i]}.webp`);
  writeFileSync(outPath, buf);
  console.log(`  ✓ ${AGENTS[i]}.webp (${(buf.length / 1024).toFixed(1)} KB)`);
}

await browser.close();
console.log('\n완료! apps/web/public/agents/ 에 파일이 저장됐습니다.');
