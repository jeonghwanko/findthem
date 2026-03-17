import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Gamepad2, Volume2, VolumeX } from 'lucide-react';
import { Application, Graphics, Text, TextStyle, Container, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';
import { getBgmEngine } from '../audio/BgmEngine';

// Explicitly register Spine render pipe (Vite may tree-shake the side-effect import)
extensions.add(SpinePipe);
import AgentWorldScene from './AgentWorldScene';

interface Props {
  stats: { total: number; found: number } | null;
  recoveryRate: number | null;
}

const SCENE_H = 360;
const FONT = '-apple-system, "Segoe UI", "Helvetica Neue", sans-serif';
const GROUND_H = 42;
const GROUND_Y = SCENE_H - GROUND_H;
const CHAR_Y = GROUND_Y + 4; // feet touch ground
const CHAR_MARGIN = 44;

// Spine/layout config only — name & bubbles come from i18n inside the component
const AGENT_SPINE_CONFIGS = [
  { skins: ['body_036', 'cos_012', 'hat_012', 'weapon_012'] as const, scale: 0.30, expressions: ['expression_thinking_2', 'expression_surprise_1'] as const, nameKey: 'home.heroAgent.detective.name', bubbleKeys: ['home.heroAgent.detective.bubble1', 'home.heroAgent.detective.bubble2'] as const },
  { skins: ['body_052', 'cos_018', 'hat_008', 'weapon_022'] as const, scale: 0.30, expressions: ['expression_fun', 'expression_preen'] as const,           nameKey: 'home.heroAgent.promo.name',     bubbleKeys: ['home.heroAgent.promo.bubble1',     'home.heroAgent.promo.bubble2']     as const },
  { skins: ['body_043', 'cos_006', 'hat_005', 'weapon_005'] as const, scale: 0.30, expressions: ['expression_joke_1', 'expression_surprise_1'] as const,   nameKey: 'home.heroAgent.guide.name',     bubbleKeys: ['home.heroAgent.guide.bubble1',     'home.heroAgent.guide.bubble2']     as const },
] as const;

interface CharState {
  char: import('../game/SpineCharacterLite').SpineCharacterLite;
  nameTag: Container;
  bubbleLbl: Text;
  x: number;
  targetX: number;
  speed: number;
  waitTimer: number;
  startDelay: number;
  isWaiting: boolean;
  bubbleAlpha: number;
  bubbleShowTimer: number;
  bubbleIdx: number;
  bubbles: readonly string[];
  expressions: readonly string[];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function randBetween(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

// ── Billboard layout calculation (single source of truth) ──────────────
const BB_Y = 60;
const BB_MARGIN = 16;

function getBillboardLayout(W: number) {
  const bW = clamp(W * 0.17, 52, 130);
  const bbW = clamp(bW * 2.8, 160, 280);
  const bbH = clamp(bbW * 0.52, 80, 150) - 10;
  const bbLeft = W - BB_MARGIN - bbW;
  return { bW, bbW, bbH, bbLeft, bbY: BB_Y };
}

// Draw static scene elements (bg, buildings, ground)
function drawSceneGraphics(g: Graphics, W: number) {
  g.clear();

  g.rect(0, 0, W, SCENE_H).fill(0xeef2ff);

  const { bW } = getBillboardLayout(W);

  // Left cluster
  g.rect(0, GROUND_Y - 130, bW * 0.65, 130).fill(0xc7d2fe);
  g.rect(bW * 0.38, GROUND_Y - 90, bW * 0.62, 90).fill(0xa5b4fc);
  for (let wy = GROUND_Y - 120; wy < GROUND_Y - 14; wy += 22) {
    g.rect(8,  wy, 10, 12).fill({ color: 0xffffff, alpha: 0.55 });
    g.rect(24, wy, 10, 12).fill({ color: 0xffffff, alpha: 0.55 });
  }

  // Right cluster
  g.rect(W - bW * 0.65, GROUND_Y - 115, bW * 0.65, 115).fill(0xc7d2fe);
  g.rect(W - bW,         GROUND_Y - 80, bW * 0.62, 80).fill(0xa5b4fc);
  for (let wy = GROUND_Y - 105; wy < GROUND_Y - 14; wy += 22) {
    g.rect(W - bW * 0.65 + 8,  wy, 10, 12).fill({ color: 0xffffff, alpha: 0.55 });
    g.rect(W - bW * 0.65 + 24, wy, 10, 12).fill({ color: 0xffffff, alpha: 0.55 });
  }

  // Ground
  g.rect(0, GROUND_Y, W, GROUND_H).fill(0xe0e7ff);
  g.rect(0, GROUND_Y, W, 2).fill(0xc7d2fe);
}

// Build billboard speech-bubble
function buildBillboard(W: number, subtitleText: string, dpr: number): Container {
  const container = new Container();
  const { bbW, bbH, bbLeft, bbY } = getBillboardLayout(W);
  const bbR = 16;

  const gfx = new Graphics();
  gfx.roundRect(bbLeft + 3, bbY + 3, bbW, bbH, bbR).fill({ color: 0x000000, alpha: 0.08 });
  gfx.roundRect(bbLeft, bbY, bbW, bbH, bbR).fill(0xffffff);
  gfx.roundRect(bbLeft, bbY, bbW, bbH, bbR).stroke({ width: 1.5, color: 0xe0e7ff });
  // Tail (bottom-right)
  const tailX = bbLeft + bbW * 0.72;
  const tailY = bbY + bbH;
  gfx.moveTo(tailX, tailY).lineTo(tailX + 14, tailY).lineTo(tailX + 10, tailY + 12).closePath().fill(0xffffff);
  gfx.moveTo(tailX, tailY).lineTo(tailX + 10, tailY + 12).stroke({ width: 1.5, color: 0xe0e7ff });
  gfx.moveTo(tailX + 14, tailY).lineTo(tailX + 10, tailY + 12).stroke({ width: 1.5, color: 0xe0e7ff });
  container.addChild(gfx);

  const fontSize = clamp(bbW * 0.08, 14, 20);
  const lbl = new Text({
    text: subtitleText,
    style: new TextStyle({
      fontFamily: FONT,
      fontSize,
      fill: '#4338ca',
      fontWeight: 'bold',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: bbW - 28,
      lineHeight: fontSize * 1.55,
    }),
    resolution: dpr,
  });
  lbl.anchor.set(0.5, 0.5);
  lbl.position.set(bbLeft + bbW / 2, bbY + bbH / 2);
  container.addChild(lbl);

  return container;
}

export default function PixiHeroScene({ stats, recoveryRate }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<'init' | 'scene' | 'ready'>('init');
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [bgmOn, setBgmOn] = useState(() => typeof window !== 'undefined' && localStorage.getItem('ft_bgm') !== 'off');

  const handleBgmToggle = useCallback(async () => {
    const engine = getBgmEngine();
    const nowPlaying = await engine.toggle();
    setBgmOn(nowPlaying);
    localStorage.setItem('ft_bgm', nowPlaying ? 'on' : 'off');
  }, []);

  // Restore BGM state & cleanup on unmount
  useEffect(() => {
    if (localStorage.getItem('ft_bgm') !== 'off') {
      getBgmEngine().start().then(() => setBgmOn(true)).catch(() => {/* blocked by autoplay policy */});
    }
    return () => getBgmEngine().dispose();
  }, []);

  // 히어로 섹션이 뷰포트에 가까워질 때만 Pixi/Spine 로드 시작
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const subtitleText = t('home.heroDesc');
    const AGENT_CONFIGS = AGENT_SPINE_CONFIGS.map((cfg) => ({
      ...cfg,
      name: t(cfg.nameKey),
      bubbles: cfg.bubbleKeys.map((k) => t(k)),
    }));

    let destroyed = false;
    const app = new Application();

    void (async () => {
      try {
        let W = container.clientWidth || 800;
        const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

        await app.init({
          canvas,
          width: W,
          height: SCENE_H,
          background: 0xeef2ff,
          antialias: true,
          autoDensity: true,
          resolution: dpr,
          roundPixels: true,
          preference: 'webgl',
          autoStart: false,
        });
        if (destroyed) return;

        await document.fonts.ready;

        // ── Static scene layer ───────────────────────────────────────────
        const sceneGfx = new Graphics();
        app.stage.addChild(sceneGfx);
        drawSceneGraphics(sceneGfx, W);

        let billboard = buildBillboard(W, subtitleText, dpr);
        app.stage.addChild(billboard);

        // Sync StatsStrip HTML position to billboard top
        const syncStats = (w: number) => {
          const el = statsRef.current;
          if (!el) return;
          const { bbLeft, bbW } = getBillboardLayout(w);
          el.style.left = `${bbLeft + bbW / 2}px`;
          el.style.top = `${BB_Y + 19}px`;
        };
        syncStats(W);

        if (!destroyed) setPhase('scene');

        // ── Spine characters ─────────────────────────────────────────────
        try {
          // prefers-reduced-motion: static scene only
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            if (!destroyed) setPhase('ready');
            app.ticker.addOnce(() => app.ticker.stop());
            app.ticker.start();
            return;
          }

          app.ticker.stop();

          const { SpineCharacterLite } = await import('../game/SpineCharacterLite');
          if (destroyed) return;

          const chars = await Promise.all(
            AGENT_CONFIGS.map((c) => SpineCharacterLite.create(c.skins)),
          );
          if (destroyed) return;

          const hasRun = !!chars[0].view.skeleton.data.findAnimation('run_1');

          const charLayer = new Container();
          app.stage.addChild(charLayer);

          let cachedWalkRight = getBillboardLayout(W).bbLeft - 20;

          const zones: [number, number][] = [
            [CHAR_MARGIN, W * 0.28],
            [W * 0.28, W * 0.56],
            [W * 0.56, cachedWalkRight],
          ];

          const charStates: CharState[] = chars.map((char, i) => {
            const cfg = AGENT_CONFIGS[i];
            char.setScale(cfg.scale);
            char.setPosition(W / 2, CHAR_Y);
            charLayer.addChild(char.view);

            // Name tag (게임 네임태그 스타일)
            const nameTag = new Container();
            const nameText = new Text({
              text: cfg.name,
              style: new TextStyle({ fontFamily: FONT, fontSize: 10, fill: '#ffffff', fontWeight: 'bold' }),
              resolution: dpr,
            });
            nameText.anchor.set(0.5, 0.5);
            const tagW = nameText.width + 14;
            const tagH = 18;
            const tagBg = new Graphics();
            tagBg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, 9).fill({ color: 0x312e81, alpha: 0.75 });
            tagBg.moveTo(-4, -tagH / 2).lineTo(0, -tagH / 2 - 5).lineTo(4, -tagH / 2).closePath().fill({ color: 0x312e81, alpha: 0.75 });
            nameTag.addChild(tagBg, nameText);
            nameTag.position.set(W / 2, CHAR_Y + 20);
            charLayer.addChild(nameTag);

            const bubbleLbl = new Text({
              text: cfg.bubbles[0],
              style: new TextStyle({ fontFamily: FONT, fontSize: 13, fill: '#4338ca', fontWeight: 'bold', align: 'center' }),
              resolution: dpr,
            });
            bubbleLbl.anchor.set(0.5, 1);
            bubbleLbl.position.set(W / 2, CHAR_Y - 65);
            bubbleLbl.alpha = 0;
            charLayer.addChild(bubbleLbl);

            // Start with run animation if available (will walk to initial target)
            if (hasRun) char.setBodyAnimation('run_1');

            const [lo, hi] = zones[i];
            return {
              char, nameTag, bubbleLbl,
              x: W / 2,
              targetX: randBetween(lo, hi),
              speed: randBetween(52, 88),
              waitTimer: 0,
              startDelay: i * 0.5,
              isWaiting: false,
              bubbleAlpha: 0,
              bubbleShowTimer: 0,
              bubbleIdx: 0,
              bubbles: cfg.bubbles,
              expressions: cfg.expressions,
            };
          });

          // ── ResizeObserver ──────────────────────────────────────────────
          const resizeOb = new ResizeObserver(([entry]) => {
            const newW = Math.round(entry.contentRect.width);
            if (destroyed || Math.abs(newW - W) <= 50) return;
            W = newW;
            cachedWalkRight = getBillboardLayout(W).bbLeft - 20;
            app.renderer.resize(newW, SCENE_H);
            drawSceneGraphics(sceneGfx, W);

            app.stage.removeChild(billboard);
            billboard.destroy({ children: true });
            billboard = buildBillboard(W, subtitleText, dpr);
            app.stage.addChildAt(billboard, 1);
            syncStats(W);

            for (const s of charStates) {
              s.targetX = clamp(s.targetX, CHAR_MARGIN, cachedWalkRight);
              s.x = clamp(s.x, 0, cachedWalkRight);
            }
          });
          resizeOb.observe(container);

          // ── Ticker ─────────────────────────────────────────────────────
          app.ticker.add((ticker) => {
            if (destroyed) return; // guard against post-destroy frame

            const dt = ticker.deltaMS / 1000;

            for (const s of charStates) {
              s.char.tick(dt);

              if (s.startDelay > 0) {
                s.startDelay -= dt;
                continue;
              }

              if (s.isWaiting) {
                s.waitTimer -= dt;
                if (s.bubbleShowTimer > 0) {
                  s.bubbleShowTimer -= dt;
                  const t0 = s.bubbleShowTimer;
                  s.bubbleAlpha = t0 > 2.5 ? Math.min(1, (3 - t0) / 0.3)
                    : t0 > 0.3 ? 1
                    : t0 / 0.3;
                } else {
                  s.bubbleAlpha = 0;
                }
                s.bubbleLbl.alpha = clamp(s.bubbleAlpha, 0, 1);

                if (s.waitTimer <= 0) {
                  s.targetX = randBetween(CHAR_MARGIN, cachedWalkRight);
                  s.isWaiting = false;
                  s.bubbleAlpha = 0;
                  if (hasRun) { s.char.cancelExpression(); s.char.setBodyAnimation('run_1'); }
                }
              } else {
                const dir = s.targetX > s.x ? 1 : -1;
                s.char.setFlipX(dir > 0);
                s.x += dir * s.speed * dt;

                s.char.setPosition(s.x, CHAR_Y);
                s.nameTag.position.set(s.x, CHAR_Y + 20);
                s.bubbleLbl.position.set(s.x, CHAR_Y - 65);
                s.bubbleLbl.alpha = 0;

                if (Math.abs(s.x - s.targetX) < 4) {
                  s.x = s.targetX;
                  s.isWaiting = true;
                  s.waitTimer = randBetween(1.5, 3.5);
                  if (hasRun) s.char.setBodyAnimation('idle');

                  s.bubbleIdx = (s.bubbleIdx + 1) % s.bubbles.length;
                  s.bubbleLbl.text = s.bubbles[s.bubbleIdx];
                  s.bubbleShowTimer = 3;

                  const expIdx = Math.floor(Math.random() * s.expressions.length);
                  s.char.playExpression(s.expressions[expIdx]);
                }
              }
            }
          });

          // Store cleanup via ref (no side-channel on app)
          cleanupRef.current = () => {
            resizeOb.disconnect();
            for (const s of charStates) s.char.dispose();
          };

          if (!destroyed) setPhase('ready');
          app.ticker.start();
        } catch {
          if (!destroyed) setPhase('ready');
          app.ticker.start();
        }
      } catch {
        if (!destroyed) setError(true);
      }
    })();

    return () => {
      destroyed = true;
      try {
        cleanupRef.current?.();
        cleanupRef.current = null;
        app.destroy(true, { children: true, texture: true });
      } catch { /* */ }
    };
  }, [visible, t]);

  if (error) {
    return (
      <section
        className="border-b border-primary-100 py-20 px-4 relative overflow-hidden"
        style={{ backgroundImage: 'radial-gradient(circle, #a5b4fc 1px, transparent 1px)', backgroundSize: '28px 28px', backgroundColor: '#eef2ff' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-white/50 pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative">
          <span className="inline-block bg-primary-100 text-primary-700 text-sm font-medium px-3 py-1 rounded-full mb-5">{t('home.heroBadge')}</span>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-5 leading-tight">{t('home.heroTitle')}</h1>
          <p className="text-gray-500 text-lg mb-10 max-w-xl mx-auto leading-relaxed">{t('home.heroDesc')}</p>
          <div className="flex gap-3 justify-center flex-wrap mb-8">
            <Link to="/game" className="inline-flex items-center gap-2 border border-amber-300 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-700 px-7 py-3.5 rounded-xl font-semibold text-base transition-all hover:-translate-y-0.5">
              <Gamepad2 className="w-4 h-4" aria-hidden="true" /> {t('home.playToSponsor')}
            </Link>
            <Link to="/reports/new" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-7 py-3.5 rounded-xl font-semibold text-base transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
              {t('home.newReport')} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link to="/browse" className="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-7 py-3.5 rounded-xl font-semibold text-base transition-all hover:-translate-y-0.5">
              {t('home.submitSighting')}
            </Link>
          </div>
          <AgentWorldScene />
          <StatsStrip stats={stats} recoveryRate={recoveryRate} t={t} />
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-primary-100" style={{ position: 'relative', height: SCENE_H, overflow: 'hidden', backgroundColor: '#1e1b4b' }}>
      {/* Pixi canvas — fades in as scene loads */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block', opacity: phase !== 'init' ? 1 : 0, transition: 'opacity 1s ease' }} />
      </div>

      {/* Loading spinner — visible until characters are ready */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
        style={{ opacity: phase === 'ready' ? 0 : phase === 'init' ? 1 : 0.6, transition: 'opacity 0.5s ease' }}
      >
        {phase !== 'ready' && <div className="w-8 h-8 border-3 border-indigo-300 border-t-white rounded-full animate-spin" />}
      </div>

      {/* Buttons — top center */}
      <div className="absolute inset-x-0 flex justify-center gap-3 z-20" style={{ top: 16, pointerEvents: 'none', opacity: phase === 'ready' ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}>
        <Link to="/game" className="inline-flex items-center gap-2 border border-amber-300 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-700 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all hover:-translate-y-0.5" style={{ pointerEvents: 'auto' }}>
          <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" /> {t('home.playToSponsor')}
        </Link>
        <Link to="/reports/new" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5" style={{ pointerEvents: 'auto' }}>
          {t('home.newReport')} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
        <Link to="/browse" className="border border-gray-200 hover:border-gray-300 bg-white/90 hover:bg-white text-gray-700 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all hover:-translate-y-0.5" style={{ pointerEvents: 'auto' }}>
          {t('home.submitSighting')}
        </Link>
        <button
          onClick={handleBgmToggle}
          className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
            bgmOn
              ? 'bg-primary-600 border-primary-500 text-white shadow-md hover:bg-primary-700'
              : 'bg-white/90 border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
          }`}
          style={{ pointerEvents: 'auto' }}
          aria-label={bgmOn ? t('home.bgmOff') : t('home.bgmOn')}
        >
          {bgmOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      {/* StatsStrip — positioned at billboard top (synced by Pixi effect) */}
      <div ref={statsRef} className="absolute z-20" style={{ transform: 'translate(-50%, -100%)', pointerEvents: 'auto', opacity: phase === 'ready' ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}>
        <StatsStrip stats={stats} recoveryRate={recoveryRate} t={t} />
      </div>
    </section>
  );
}

function StatsStrip({ stats, recoveryRate, t }: { stats: Props['stats']; recoveryRate: number | null; t: (k: string) => string }) {
  return (
    <div className="inline-flex items-center bg-indigo-600/85 backdrop-blur-sm border border-indigo-500 rounded-xl px-1 py-0.5 shadow-sm divide-x divide-indigo-400/40 whitespace-nowrap">
      <div className="px-5 py-1.5 text-center">
        {stats ? <p className="text-base font-bold text-white tabular-nums">{stats.total.toLocaleString()}</p> : <div className="h-5 w-10 mx-auto bg-indigo-400 rounded animate-pulse" />}
        <p className="text-[10px] text-indigo-200">{t('home.statTotal')}</p>
      </div>
      <div className="px-5 py-1.5 text-center">
        {stats ? <p className="text-base font-bold text-amber-300 tabular-nums">{stats.found.toLocaleString()}</p> : <div className="h-5 w-8 mx-auto bg-indigo-400 rounded animate-pulse" />}
        <p className="text-[10px] text-indigo-200">{t('home.statFound')}</p>
      </div>
      <div className="px-5 py-1.5 text-center">
        {recoveryRate !== null ? <p className="text-base font-bold text-emerald-300 tabular-nums">{recoveryRate}%</p> : <div className="h-5 w-8 mx-auto bg-indigo-400 rounded animate-pulse" />}
        <p className="text-[10px] text-indigo-200">{t('home.statRate')}</p>
      </div>
    </div>
  );
}
