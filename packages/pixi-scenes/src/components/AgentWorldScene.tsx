import { useRef, useEffect } from 'react';

// Agent colors
const C_HERMI = '#EC4899';
const C_CLAUDE = '#3B82F6';
const C_ALI = '#22C55E';

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  walkPhase: number,
  name: string,
  facing: 'left' | 'right' = 'right',
) {
  const dir = facing === 'left' ? -1 : 1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const leg1 = Math.sin(walkPhase) * 8;
  const leg2 = Math.sin(walkPhase + Math.PI) * 8;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 2);
  ctx.lineTo(x - 4 + leg1 * dir, y + 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 2);
  ctx.lineTo(x + 4 + leg2 * dir, y + 18);
  ctx.stroke();

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  if ((ctx as CanvasRenderingContext2D & { roundRect?: (...args: unknown[]) => void }).roundRect) {
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x - 9, y - 18, 18, 22, 5);
  } else {
    ctx.rect(x - 9, y - 18, 18, 22);
  }
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(x, y - 30, 13, 0, Math.PI * 2);
  ctx.fill();

  // Face shine
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(x - 3, y - 35, 5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const ex = dir * 2;
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x - 4 + ex, y - 31, 3, 0, Math.PI * 2);
  ctx.arc(x + 4 + ex, y - 31, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(x - 3 + ex, y - 30, 1.5, 0, Math.PI * 2);
  ctx.arc(x + 5 + ex, y - 30, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Name label
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name, x, y + 32);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  align: 'left' | 'right' = 'left',
) {
  ctx.font = '11px -apple-system, sans-serif';
  const metrics = ctx.measureText(text);
  const w = metrics.width + 20;
  const h = 24;
  const bx = align === 'left' ? x : x - w;
  const by = y - h - 10;

  ctx.fillStyle = 'white';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if ((ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect) {
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(bx, by, w, h, 8);
  } else {
    ctx.rect(bx, by, w, h);
  }
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.beginPath();
  if (align === 'left') {
    ctx.moveTo(bx + 12, by + h);
    ctx.lineTo(bx + 8, by + h + 8);
    ctx.lineTo(bx + 20, by + h);
  } else {
    ctx.moveTo(bx + w - 12, by + h);
    ctx.lineTo(bx + w - 8, by + h + 8);
    ctx.lineTo(bx + w - 20, by + h);
  }
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = '#374151';
  ctx.textAlign = align === 'left' ? 'left' : 'right';
  ctx.fillText(text, align === 'left' ? bx + 10 : bx + w - 10, by + 16);
}

function drawMagnifyingGlass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 7, y + 7);
  ctx.lineTo(x + 15, y + 15);
  ctx.stroke();
}

function drawChannelCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  glow: boolean,
  title: string,
) {
  const w = 48, h = 34;

  if (glow) {
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 12;
  }

  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  if ((ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect) {
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, 4);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();

  // Play button
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  if ((ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect) {
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x + w / 2 - 8, y + h / 2 - 6, 16, 12, 2);
  } else {
    ctx.rect(x + w / 2 - 8, y + h / 2 - 6, 16, 12);
  }
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 2, y + h / 2 - 4);
  ctx.lineTo(x + w / 2 + 6, y + h / 2);
  ctx.lineTo(x + w / 2 - 2, y + h / 2 + 4);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.fillStyle = '#6b7280';
  ctx.font = '8px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title.length > 6 ? `${title.slice(0, 6)}..` : title, x + w / 2, y + h + 10);
}

function drawPhotoFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  bg: string,
) {
  ctx.fillStyle = bg;
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if ((ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect) {
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, 6);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
  ctx.stroke();

  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🐕', x + w / 2, y + h / 2 + 8);

  ctx.fillStyle = '#6b7280';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h - 6);
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#eef2ff');
  grad.addColorStop(1, '#e0e7ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#c7d2fe';
  ctx.fillRect(0, 148, W, 4);
  ctx.fillStyle = 'rgba(221,214,254,0.12)';
  ctx.fillRect(0, 152, W, H - 152);
}

function drawSceneLabel(
  ctx: CanvasRenderingContext2D,
  _W: number,
  label: string,
  sub: string,
) {
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 12, 18);
  ctx.fillStyle = '#a5b4fc';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.fillText(sub, 12, 30);
}

// Scene 0: Outreach — Hermi finds a YouTuber
function drawScene0(ctx: CanvasRenderingContext2D, W: number, t: number) {
  const FLOOR = 145;

  const cards = [
    { x: W * 0.18, title: '고양이탐정' },
    { x: W * 0.30, title: '총멋명' },
    { x: W * 0.42, title: '개냥이' },
    { x: W * 0.54, title: '자전거루' },
  ];

  const hermiX =
    t < 0.35
      ? W * 0.08 + W * 0.38 * (t / 0.35)
      : W * 0.46;
  const walkPhase = t < 0.35 ? t * 20 : 0;

  cards.forEach((card, i) => {
    const glowing = t > 0.32 && i === 0;
    drawChannelCard(ctx, card.x, FLOOR - 52, glowing, card.title);
  });

  // Magnifying glass
  if (t < 0.42) {
    const alpha = t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.1);
    ctx.globalAlpha = alpha;
    drawMagnifyingGlass(ctx, hermiX + 18, FLOOR - 70, '#f59e0b');
    ctx.globalAlpha = 1;
  }

  // Speech bubble
  if (t > 0.36 && t < 0.62) {
    const alpha =
      t < 0.41 ? (t - 0.36) / 0.05 : t > 0.57 ? 1 - (t - 0.57) / 0.05 : 1;
    ctx.globalAlpha = Math.min(1, alpha);
    drawSpeechBubble(ctx, hermiX, FLOOR - 58, '고양이탐정 발견!', C_HERMI, 'left');
    ctx.globalAlpha = 1;
  }

  drawCharacter(ctx, hermiX, FLOOR, C_HERMI, walkPhase, '헤르미', 'right');

  // YouTuber on right
  const ytX = W * 0.86;
  ctx.fillStyle = '#374151';
  ctx.fillRect(ytX + 12, FLOOR - 38, 18, 12);
  ctx.fillStyle = '#6b7280';
  ctx.beginPath();
  ctx.arc(ytX + 14, FLOOR - 32, 5, 0, Math.PI * 2);
  ctx.fill();
  drawCharacter(ctx, ytX, FLOOR, '#f59e0b', 0, '유튜버', 'left');

  // Flying letter
  if (t > 0.56 && t < 0.9) {
    const tp = (t - 0.56) / 0.32;
    const e = tp < 0.5 ? 2 * tp * tp : -1 + (4 - 2 * tp) * tp;

    const lx0 = hermiX + 10, ly0 = FLOOR - 42;
    const lx2 = ytX - 22, ly2 = FLOOR - 42;
    const lx1 = (lx0 + lx2) / 2, ly1 = FLOOR - 130;

    const lx = (1 - e) * (1 - e) * lx0 + 2 * (1 - e) * e * lx1 + e * e * lx2;
    const ly = (1 - e) * (1 - e) * ly0 + 2 * (1 - e) * e * ly1 + e * e * ly2;

    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if ((ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect) {
      (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(lx - 10, ly - 7, 20, 14, 3);
    } else {
      ctx.rect(lx - 10, ly - 7, 20, 14);
    }
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx - 10, ly - 7);
    ctx.lineTo(lx, ly + 2);
    ctx.lineTo(lx + 10, ly - 7);
    ctx.strokeStyle = '#a5b4fc';
    ctx.stroke();
  }

  // Checkmark
  if (t > 0.87) {
    const alpha = Math.min(1, (t - 0.87) / 0.08);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#22C55E';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✓', ytX, FLOOR - 65);
    ctx.globalAlpha = 1;
  }
}

// Scene 1: Image Matching — Claude compares photos
function drawScene1(ctx: CanvasRenderingContext2D, W: number, t: number) {
  const FLOOR = 145;
  const pw = 70, ph = 55;
  const lx = W * 0.10, ly = FLOOR - ph - 20;
  const rx = W * 0.80, ry = FLOOR - ph - 20;

  drawPhotoFrame(ctx, lx, ly, pw, ph, '실종 사진', '#dbeafe');
  drawPhotoFrame(ctx, rx, ry, pw, ph, '제보 사진', '#fce7f3');

  const claudeX =
    t < 0.4
      ? lx + pw + (rx - lx - pw) * (t / 0.4)
      : rx - 10;
  const walkPhase = t < 0.4 ? t * 18 : 0;
  drawCharacter(ctx, claudeX, FLOOR, C_CLAUDE, walkPhase, '클로드', 'right');

  // Scan line
  if (t > 0.4 && t < 0.7) {
    const st = (t - 0.4) / 0.28;
    const sy = ry + st * ph;
    ctx.fillStyle = 'rgba(59,130,246,0.25)';
    ctx.fillRect(rx, Math.max(ry, sy - 8), pw, 8);
    ctx.fillStyle = 'rgba(59,130,246,0.7)';
    ctx.fillRect(rx, Math.max(ry, sy - 1), pw, 2);
  }

  // Popup
  if (t > 0.7) {
    const popT = Math.min(1, (t - 0.7) / 0.15);
    const scale = popT < 0.5 ? popT * 2 : 1;
    const px = W / 2, py = FLOOR - 82;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#dcfce7';
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if ((ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect) {
      (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(-48, -24, 96, 46, 10);
    } else {
      ctx.rect(-48, -24, 96, 46);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#166534';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('87% 일치!', 0, 4);
    ctx.font = '9px -apple-system, sans-serif';
    ctx.fillStyle = '#16a34a';
    ctx.fillText('매칭 알림 발송 중...', 0, 18);

    ctx.restore();
  }
}

// Scene 2: Chatbot — Ali collects sighting
function drawScene2(ctx: CanvasRenderingContext2D, W: number, t: number) {
  const FLOOR = 145;
  const aliX = W / 2;

  drawCharacter(ctx, aliX, FLOOR, C_ALI, 0, '알리', 'right');

  // User icon + bubble
  if (t > 0.08) {
    const alpha = Math.min(1, (t - 0.08) / 0.1);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(W * 0.14, FLOOR - 62, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👤', W * 0.14, FLOOR - 57);

    drawSpeechBubble(ctx, W * 0.25, FLOOR - 52, '강아지 못 봤나요?', '#9ca3af', 'left');
    ctx.globalAlpha = 1;
  }

  // Typing dots
  if (t > 0.3 && t < 0.52) {
    const dotAlpha = Math.min(1, (t - 0.3) / 0.1);
    ctx.globalAlpha = dotAlpha;
    const dotPhase = (t * 5) % 1;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 < dotPhase ? 1 : 0.25;
      ctx.fillStyle = `rgba(34,197,94,${a})`;
      ctx.beginPath();
      ctx.arc(aliX + 22 + i * 9, FLOOR - 68, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Ali bubble
  if (t > 0.52) {
    const alpha = Math.min(1, (t - 0.52) / 0.1);
    ctx.globalAlpha = alpha;
    drawSpeechBubble(ctx, W * 0.76, FLOOR - 52, '어디서 보셨나요?', C_ALI, 'right');
    ctx.globalAlpha = 1;
  }

  // Photo icon
  if (t > 0.65 && t < 0.88) {
    const alpha =
      t < 0.70 ? (t - 0.65) / 0.05 : t > 0.83 ? 1 - (t - 0.83) / 0.05 : 1;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📸', aliX, FLOOR - 95 + Math.sin(t * 10) * 3);
    ctx.globalAlpha = 1;
  }

  // Checkmark
  if (t > 0.86) {
    const alpha = Math.min(1, (t - 0.86) / 0.1);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✅', aliX, FLOOR - 96);
    ctx.fillStyle = '#166534';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText('제보 접수 완료!', aliX, FLOOR - 74);
    ctx.globalAlpha = 1;
  }
}

const SCENES = [
  { draw: drawScene0, label: '아웃리치', sub: '기자/유튜버 섭외 중...' },
  { draw: drawScene1, label: 'AI 이미지 매칭', sub: '사진 분석 중...' },
  { draw: drawScene2, label: '챗봇 제보 수집', sub: '목격 정보 접수 중...' },
];

const SCENE_MS = 5200;
const FADE_MS = 500;

export default function AgentWorldScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const pauseOffsetRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function resize() {
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = 200;
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    startRef.current = performance.now();

    function tick(now: number) {
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const elapsed = now - startRef.current - pauseOffsetRef.current;

      const cycleMs = SCENE_MS * SCENES.length;
      const cycleT = elapsed % cycleMs;
      const idx = Math.floor(cycleT / SCENE_MS);
      const sceneT = (cycleT % SCENE_MS) / SCENE_MS;

      let fadeAlpha = 1;
      const fadeRatio = FADE_MS / SCENE_MS;
      if (sceneT < fadeRatio) fadeAlpha = sceneT / fadeRatio;
      if (sceneT > 1 - fadeRatio) fadeAlpha = (1 - sceneT) / fadeRatio;

      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, W, H);

      ctx.globalAlpha = Math.max(0, Math.min(1, fadeAlpha));

      const scene = SCENES[idx];
      if (scene) {
        drawSceneLabel(ctx, W, scene.label, scene.sub);
        scene.draw(ctx, W, sceneT);
      }

      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    function handleVisibility() {
      if (document.hidden) {
        pausedRef.current = true;
        pauseStartRef.current = performance.now();
      } else {
        if (pausedRef.current) {
          pauseOffsetRef.current += performance.now() - pauseStartRef.current;
        }
        pausedRef.current = false;
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full max-w-3xl">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '200px', display: 'block' }}
      />
    </div>
  );
}
