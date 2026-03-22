/**
 * Google Play Store 스크린샷 생성 스크립트
 *
 * 9:16 비율 (1080×1920) 마케팅 이미지 5장 생성
 * - 상단: 아이콘 + 피처 타이틀
 * - 중앙: 폰 프레임 + 앱 스크린샷 합성
 *
 * 사용법:
 *   1. Android 에뮬레이터에서 각 화면 스크린샷 촬영
 *   2. resources/store-screenshots/ 폴더에 저장:
 *      - 01_home.png
 *      - 02_report.png
 *      - 03_matching.png
 *      - 04_community.png
 *      - 05_game.png
 *   3. node scripts/generate-store-screenshots.mjs
 *
 * 스크린샷 없이 실행하면 플레이스홀더로 생성됩니다.
 *
 * 실행: node apps/web/scripts/generate-store-screenshots.mjs
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

// ── 캔버스 사이즈 (9:16) ──
const W = 1080;
const H = 1920;

// ── 폰 프레임 치수 ──
const PHONE_W = 640;
const PHONE_H = 1240;
const PHONE_X = (W - PHONE_W) / 2;
const PHONE_Y = 520;
const PHONE_RADIUS = 44;
const PHONE_BEZEL = 14;
const SCREEN_X = PHONE_X + PHONE_BEZEL;
const SCREEN_Y = PHONE_Y + PHONE_BEZEL;
const SCREEN_W = PHONE_W - PHONE_BEZEL * 2;
const SCREEN_H = PHONE_H - PHONE_BEZEL * 2;

// ── 브랜드 색상 ──
const COLORS = {
  primary: '#6366f1',    // indigo-500
  primaryDark: '#4f46e5', // indigo-600
  accent: '#f59e0b',     // amber-500
  bg: '#eef2ff',         // indigo-50
  bgGrad: '#e0e7ff',     // indigo-100
  dark: '#1e1b4b',       // indigo-950
  text: '#111827',
  textSub: '#6b7280',
  white: '#ffffff',
  phoneBg: '#1f2937',    // gray-800 (phone bezel)
};

// ── 한글 폰트 ──
const FONT = '"맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// ── 5장 스크린샷 정의 ──
const SLIDES = [
  {
    file: '01_home.png',
    title: 'AI가 실종자를\n찾아드립니다.',
    subtitle: 'AI 이미지 매칭으로 빠르게',
    accentColor: '#6366f1',
  },
  {
    file: '02_report.png',
    title: '간편한\n실종 신고.',
    subtitle: '사진과 정보만 입력하세요',
    accentColor: '#8b5cf6',
  },
  {
    file: '03_matching.png',
    title: 'AI가 자동으로\n비교·매칭.',
    subtitle: '목격 제보와 사진을 분석합니다',
    accentColor: '#6366f1',
  },
  {
    file: '04_community.png',
    title: 'AI 에이전트와\n함께하는 커뮤니티.',
    subtitle: '실시간 정보 공유',
    accentColor: '#8b5cf6',
  },
  {
    file: '05_game.png',
    title: '게임하며\nAI 팀 후원.',
    subtitle: '찾아가는 계단 미니게임',
    accentColor: '#6366f1',
  },
];

// ── 유틸: 둥근 사각형 ──
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── 유틸: 그라데이션 배경 ──
function drawBackground(ctx, accentColor) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, COLORS.bg);
  grad.addColorStop(0.4, COLORS.bgGrad);
  grad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 상단 장식 — 반투명 원
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.arc(-60, -60, 360, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W + 40, 200, 240, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── 유틸: 폰 프레임 그리기 ──
function drawPhoneFrame(ctx) {
  // 그림자
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;

  // 폰 외곽 (베젤)
  roundRect(ctx, PHONE_X, PHONE_Y, PHONE_W, PHONE_H, PHONE_RADIUS);
  ctx.fillStyle = COLORS.phoneBg;
  ctx.fill();
  ctx.restore();

  // 스크린 영역 (흰색 기본)
  roundRect(ctx, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, PHONE_RADIUS - PHONE_BEZEL);
  ctx.fillStyle = COLORS.white;
  ctx.fill();
}

// ── 유틸: 스크린 안에 스크린샷 합성 ──
function drawScreenshot(ctx, img) {
  ctx.save();
  roundRect(ctx, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, PHONE_RADIUS - PHONE_BEZEL);
  ctx.clip();
  ctx.drawImage(img, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);
  ctx.restore();
}

// ── 유틸: 플레이스홀더 UI 그리기 ──
function drawPlaceholder(ctx, slideIndex) {
  ctx.save();
  roundRect(ctx, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, PHONE_RADIUS - PHONE_BEZEL);
  ctx.clip();

  // 흰색 배경
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);

  // 상태바
  ctx.fillStyle = COLORS.primary;
  ctx.fillRect(SCREEN_X, SCREEN_Y, SCREEN_W, 36);

  // 헤더
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(SCREEN_X, SCREEN_Y + 36, SCREEN_W, 56);
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('찾아줘', SCREEN_X + SCREEN_W / 2, SCREEN_Y + 64);

  // 컨텐츠 영역 — 슬라이드별 간단 모의 UI
  const contentY = SCREEN_Y + 100;
  const cw = SCREEN_W;
  const cx = SCREEN_X;

  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(cx, contentY, cw, SCREEN_H - 100);

  // 카드 모킹
  const cardColors = ['#eef2ff', '#fef3c7', '#ecfdf5', '#fce7f3', '#f0fdf4'];
  for (let i = 0; i < 3; i++) {
    const cardY = contentY + 20 + i * 180;
    roundRect(ctx, cx + 24, cardY, cw - 48, 160, 16);
    ctx.fillStyle = COLORS.white;
    ctx.fill();

    // 썸네일 placeholder
    roundRect(ctx, cx + 40, cardY + 16, 128, 128, 12);
    ctx.fillStyle = cardColors[i % cardColors.length];
    ctx.fill();

    // 텍스트 라인 placeholder
    for (let j = 0; j < 3; j++) {
      roundRect(ctx, cx + 184, cardY + 20 + j * 36, (cw - 248) * (1 - j * 0.2), 20, 4);
      ctx.fillStyle = j === 0 ? '#d1d5db' : '#e5e7eb';
      ctx.fill();
    }
  }

  // 하단 탭바
  const tabY = SCREEN_Y + SCREEN_H - 64;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(cx, tabY, cw, 64);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, tabY);
  ctx.lineTo(cx + cw, tabY);
  ctx.stroke();

  // 탭 아이콘 dots
  const tabIcons = ['●', '●', '◉', '●', '●'];
  const tabW = cw / 5;
  tabIcons.forEach((icon, i) => {
    ctx.fillStyle = i === slideIndex % 5 ? COLORS.primary : '#9ca3af';
    ctx.font = i === 2 ? `bold 32px ${FONT}` : `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(icon, cx + tabW * i + tabW / 2, tabY + 34);
  });

  ctx.restore();
}

// ── 유틸: 타이틀 텍스트 ──
function drawTitle(ctx, slide, appIcon) {
  // 앱 아이콘 (상단)
  const iconSize = 64;
  ctx.drawImage(appIcon, W / 2 - iconSize / 2, 60, iconSize, iconSize);

  const titleY = 160;

  // 타이틀 (멀티라인)
  const lines = slide.title.split('\n');
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillStyle = COLORS.dark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, titleY + i * 72);
  });

  // 서브타이틀
  const subY = titleY + lines.length * 72 + 24;
  ctx.font = `30px ${FONT}`;
  ctx.fillStyle = COLORS.textSub;
  ctx.fillText(slide.subtitle, W / 2, subY);

  // 언더라인 장식
  const lineW = 60;
  ctx.strokeStyle = slide.accentColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W / 2 - lineW / 2, subY + 30);
  ctx.lineTo(W / 2 + lineW / 2, subY + 30);
  ctx.stroke();
}

// ── 메인 ──
async function main() {
  const outDir = join(root, 'resources/store-screenshots');
  const ssDir = join(root, 'resources/store-screenshots/raw');

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!existsSync(ssDir)) mkdirSync(ssDir, { recursive: true });

  // 앱 아이콘 로드
  const iconBuffer = await sharp(join(root, 'resources/icon.png'))
    .resize(80, 80)
    .png()
    .toBuffer();
  const appIcon = await loadImage(iconBuffer);

  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i];
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 1) 그라데이션 배경
    drawBackground(ctx, slide.accentColor);

    // 2) 상단 타이틀
    drawTitle(ctx, slide, appIcon);

    // 3) 폰 프레임
    drawPhoneFrame(ctx);

    // 4) 스크린샷 합성 또는 플레이스홀더
    const ssPath = join(ssDir, slide.file);
    if (existsSync(ssPath)) {
      const ssBuffer = await sharp(ssPath)
        .resize(SCREEN_W, SCREEN_H, { fit: 'cover' })
        .png()
        .toBuffer();
      const ssImg = await loadImage(ssBuffer);
      drawScreenshot(ctx, ssImg);
      console.log(`  ✓ ${slide.file} — 실제 스크린샷 합성`);
    } else {
      drawPlaceholder(ctx, i);
      console.log(`  ⊘ ${slide.file} — 플레이스홀더 (raw/${slide.file} 없음)`);
    }

    // 5) 하단 브랜드
    const brandY = H - 50;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = COLORS.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.drawImage(appIcon, W / 2 - 110, brandY - 14, 28, 28);
    ctx.fillText('찾아줘 - AI 탐정', W / 2 + 10, brandY);

    // 6) PNG 저장
    const outPath = join(outDir, `store_${String(i + 1).padStart(2, '0')}.png`);
    const pngBuffer = canvas.toBuffer('image/png');
    writeFileSync(outPath, pngBuffer);
    console.log(`✓ ${outPath} 생성 (${W}×${H})`);
  }

  console.log(`\n완료! ${SLIDES.length}장 생성됨.`);
  console.log('\n실제 스크린샷을 합성하려면:');
  console.log(`  1. Android 에뮬레이터에서 각 화면 캡처`);
  console.log(`  2. resources/store-screenshots/raw/ 에 저장:`);
  SLIDES.forEach((s) => console.log(`     - ${s.file}`));
  console.log(`  3. 다시 실행: node apps/web/scripts/generate-store-screenshots.mjs`);
}

main().catch((err) => {
  console.error('생성 실패:', err);
  process.exit(1);
});
