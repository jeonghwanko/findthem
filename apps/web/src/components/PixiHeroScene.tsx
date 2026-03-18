import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Gamepad2, Volume2, VolumeX } from 'lucide-react';
import { Application, Graphics, Text, TextStyle, Container, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';
import { getBgmEngine } from '../audio/BgmEngine';
import { HeroLoadingOverlay } from './HeroLoadingOverlay';
import { XP_PER_AD, TOKEN_STORAGE_KEY } from '@findthem/shared';
import type { AdRewardResult, SponsorXpStats } from '@findthem/shared';
import { api } from '../api/client';
import { useRewardAd } from '../hooks/useRewardAd';

// Explicitly register Spine render pipe (Vite may tree-shake the side-effect import)
extensions.add(SpinePipe);
import AgentWorldScene from './AgentWorldScene';

interface Props {
  stats: { total: number; found: number } | null;
  recoveryRate: number | null;
}

const SCENE_H = 360;
const MOBILE_SCENE_H = 480;
const FONT = '-apple-system, "Segoe UI", "Helvetica Neue", sans-serif';
const GROUND_H = 42;
const GROUND_Y = SCENE_H - GROUND_H;
const CHAR_Y = GROUND_Y + 4; // feet touch ground
const CHAR_MARGIN = 44;

// Spine/layout config only — name & bubbles come from i18n inside the component
const AGENT_SPINE_CONFIGS = [
  { skins: ['body_090', 'cos_090', 'hair_090', 'hat_090', 'weapon_090'] as const, scale: 0.30, expressions: ['expression_thinking_2', 'expression_surprise_1'] as const, nameKey: 'home.heroAgent.detective.name', bubbleKeys: ['home.heroAgent.detective.bubble1', 'home.heroAgent.detective.bubble2'] as const },
  { skins: ['body_102', 'cos_102', 'hair_102', 'hat_102', 'weapon_102'] as const, scale: 0.30, expressions: ['expression_fun', 'expression_preen'] as const,           nameKey: 'home.heroAgent.promo.name',     bubbleKeys: ['home.heroAgent.promo.bubble1',     'home.heroAgent.promo.bubble2']     as const },
  { skins: ['body_043', 'cos_042', 'hair_000', 'hat_042', 'weapon_042'] as const, scale: 0.30, expressions: ['expression_joke_1', 'expression_surprise_1'] as const,   nameKey: 'home.heroAgent.guide.name',     bubbleKeys: ['home.heroAgent.guide.bubble1',     'home.heroAgent.guide.bubble2']     as const },
] as const;

interface CharState {
  char: import('../game/SpineCharacterLite').SpineCharacterLite;
  nameTag: Container;
  bubble: Container;
  bubbleText: Text;
  bubbleBg: Graphics;
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

interface AdEventRef {
  charIdx: number;
  startedAt: number;
  duration: number;
  handled: boolean;
  lastExpressionAt: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function randBetween(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

// ── Billboard layout calculation (single source of truth) ──────────────
const BB_Y = 82;
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

// Build billboard speech-bubble — returns { container, lbl } for live text updates
function buildBillboard(W: number, subtitleText: string, dpr: number): { container: Container; lbl: Text } {
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

  return { container, lbl };
}

export default function PixiHeroScene({ stats, recoveryRate }: Props) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Mutable refs for live-updating text when language changes
  const charStatesRef = useRef<CharState[] | null>(null);
  const billboardRef = useRef<{ container: Container; lbl: Text } | null>(null);
  const [phase, setPhase] = useState<'init' | 'scene' | 'ready'>('init');
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [bgmOn, setBgmOn] = useState(() => typeof window !== 'undefined' && localStorage.getItem('ft_bgm') !== 'off');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── 광고 이벤트 상태 ─────────────────────────────────────────────────
  const adEventRef = useRef<AdEventRef | null>(null);
  const nextAdEventAtRef = useRef<number>(Date.now() + randBetween(15_000, 30_000));
  const [adEventDisplay, setAdEventDisplay] = useState<{ charIdx: number; x: number } | null>(null);
  const isHandlingAdRef = useRef(false);
  const [xpStats, setXpStats] = useState<SponsorXpStats | null>(null);
  const [xpToast, setXpToast] = useState<string | null>(null);

  const { showRewardAd, isNative } = useRewardAd();

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

  // XP 통계 초기 로드 (로그인 상태일 때만)
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    void api.get<SponsorXpStats>('/users/me/xp-stats')
      .then((data) => setXpStats(data))
      .catch(() => {/* 네트워크 오류 무시 */});
  }, []);

  // XP 토스트 자동 숨김
  useEffect(() => {
    if (!xpToast) return;
    const t = setTimeout(() => setXpToast(null), 3000);
    return () => clearTimeout(t);
  }, [xpToast]);

  // 광고 이벤트 overlay 위치 동기화 (200ms 폴링)
  useEffect(() => {
    if (phase !== 'ready') return;
    const iv = setInterval(() => {
      const ev = adEventRef.current;
      const states = charStatesRef.current;
      if (!ev || ev.handled || !states) {
        setAdEventDisplay(null);
        return;
      }
      const elapsed = Date.now() - ev.startedAt;
      if (elapsed > ev.duration) {
        adEventRef.current = null;
        setAdEventDisplay(null);
        return;
      }
      setAdEventDisplay({ charIdx: ev.charIdx, x: states[ev.charIdx].x });
    }, 200);
    return () => clearInterval(iv);
  }, [phase]);

  // 광고 클릭 핸들러
  const handleAdClick = useCallback(async () => {
    if (!adEventRef.current || adEventRef.current.handled || isHandlingAdRef.current) return;
    isHandlingAdRef.current = true;
    adEventRef.current.handled = true;
    setAdEventDisplay(null);

    try {
      // 네이티브: AdMob 광고 시청 먼저 (거부/실패 시 XP 미지급)
      if (isNative) {
        const rewarded = await showRewardAd();
        if (!rewarded) {
          isHandlingAdRef.current = false;
          return;
        }
      }

      const result = await api.post<AdRewardResult>('/users/me/ad-reward');
      setXpStats((prev) => prev ? { ...prev, sponsorXp: result.newXp, userLevel: result.newLevel } : null);
      if (result.leveledUp) {
        setXpToast(tRef.current('home.adReward.levelUp', { level: result.newLevel, reward: result.reward?.label ?? '' }));
      } else {
        setXpToast(tRef.current('home.adReward.xpGained', { xp: XP_PER_AD }));
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'AUTH_REQUIRED') {
        setXpToast(tRef.current('home.adReward.loginRequired'));
      } else if (msg === 'AD_REWARD_COOLDOWN') {
        setXpToast(tRef.current('home.adReward.cooldown'));
      } else {
        setXpToast(tRef.current('home.adReward.error'));
      }
    } finally {
      isHandlingAdRef.current = false;
    }
  }, [showRewardAd, isNative]);

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

    const tr = tRef.current;
    const subtitleText = tr('home.heroDesc');
    const AGENT_CONFIGS = AGENT_SPINE_CONFIGS.map((cfg) => ({
      ...cfg,
      name: tr(cfg.nameKey),
      bubbles: cfg.bubbleKeys.map((k) => tr(k)),
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

        let bb = buildBillboard(W, subtitleText, dpr);
        billboardRef.current = bb;
        app.stage.addChild(bb.container);

        // Sync StatsStrip HTML position to billboard top
        const syncStats = (w: number) => {
          const el = statsRef.current;
          if (!el) return;
          const { bbLeft, bbW } = getBillboardLayout(w);
          el.style.left = `${bbLeft + bbW / 2}px`;
          el.style.top = `82px`;
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

          const { SpineCharacterLite, setSpineLoadProgress } = await import('../game/SpineCharacterLite');
          if (destroyed) return;

          setSpineLoadProgress((loaded, _t) => { if (!destroyed) setLoadProgress(loaded); });

          const chars = await Promise.all(
            AGENT_CONFIGS.map((c) => SpineCharacterLite.create(c.skins)),
          );
          setSpineLoadProgress(null);
          if (destroyed) return;

          const hasRun = !!chars[0].view.skeleton.data.findAnimation('run_1');

          // 광고 이벤트 중 재생할 바디 애니 목록 (idle, run 제외 — 댄스/이모션 계열)
          const adBodyAnims = chars[0].getAnimationNames().filter(
            (n) => n !== 'idle' && !n.startsWith('run'),
          );

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

            // Speech bubble container (bg + tail + text)
            const bubble = new Container();
            bubble.alpha = 0;
            const bubbleBg = new Graphics();
            bubble.addChild(bubbleBg);
            const bubbleText = new Text({
              text: cfg.bubbles[0],
              style: new TextStyle({ fontFamily: FONT, fontSize: 12, fill: '#4338ca', fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: 120 }),
              resolution: dpr,
            });
            bubbleText.anchor.set(0.5, 0.5);
            bubble.addChild(bubbleText);
            bubble.position.set(W / 2, CHAR_Y - 90);
            charLayer.addChild(bubble);

            // Start with run animation if available (will walk to initial target)
            if (hasRun) char.setBodyAnimation('run_1');

            const [lo, hi] = zones[i];
            return {
              char, nameTag, bubble, bubbleText, bubbleBg,
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
          charStatesRef.current = charStates;

          // ── ResizeObserver ──────────────────────────────────────────────
          const resizeOb = new ResizeObserver(([entry]) => {
            const newW = Math.round(entry.contentRect.width);
            if (destroyed || Math.abs(newW - W) <= 50) return;
            W = newW;
            cachedWalkRight = getBillboardLayout(W).bbLeft - 20;
            app.renderer.resize(newW, SCENE_H);
            drawSceneGraphics(sceneGfx, W);

            app.stage.removeChild(bb.container);
            bb.container.destroy({ children: true });
            bb = buildBillboard(W, tRef.current('home.heroDesc'), dpr);
            billboardRef.current = bb;
            app.stage.addChildAt(bb.container, 1);
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

            for (let i = 0; i < charStates.length; i++) {
              const s = charStates[i];
              s.char.tick(dt);

              if (s.startDelay > 0) {
                s.startDelay -= dt;
                continue;
              }

              // 광고 이벤트 발생 시: 해당 캐릭터 이동 정지 + 댄스/이모션 바디 애니
              const isAdTarget = adEventRef.current && !adEventRef.current.handled && adEventRef.current.charIdx === i;
              if (isAdTarget && !s.isWaiting) {
                s.isWaiting = true;
                s.waitTimer = 99;
                s.bubbleAlpha = 0;
                s.bubbleShowTimer = 0;
                // 랜덤 바디 애니 시도 (없으면 idle)
                let played = false;
                if (adBodyAnims.length > 0) {
                  const pick = adBodyAnims[Math.floor(Math.random() * adBodyAnims.length)];
                  played = s.char.playBodyAnimSafe(pick);
                }
                if (!played) s.char.setBodyAnimation('idle');
              }
              if (isAdTarget && s.isWaiting) {
                // 광고 이벤트 동안 waitTimer 소진 방지 (표정 루프는 ad 섹션에서 처리)
                s.waitTimer = Math.max(s.waitTimer, 5);
                s.bubble.alpha = 0;
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
                s.bubble.alpha = clamp(s.bubbleAlpha, 0, 1);

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
                s.bubble.position.set(s.x, CHAR_Y - 90);
                s.bubble.alpha = 0;

                if (Math.abs(s.x - s.targetX) < 4) {
                  s.x = s.targetX;
                  s.isWaiting = true;
                  s.waitTimer = randBetween(1.5, 3.5);
                  if (hasRun) s.char.setBodyAnimation('idle');

                  s.bubbleIdx = (s.bubbleIdx + 1) % s.bubbles.length;
                  s.bubbleText.text = s.bubbles[s.bubbleIdx];
                  // Redraw bubble background to fit new text
                  const pad = 10;
                  const tailH = 8;
                  const bw = s.bubbleText.width + pad * 2;
                  const bh = s.bubbleText.height + pad * 2;
                  s.bubbleText.position.set(0, -bh / 2 - tailH);
                  s.bubbleBg.clear();
                  s.bubbleBg.roundRect(-bw / 2, -bh - tailH, bw, bh, 10).fill(0xffffff);
                  s.bubbleBg.roundRect(-bw / 2, -bh - tailH, bw, bh, 10).stroke({ width: 1.5, color: 0xe0e7ff });
                  // Tail pointing down
                  s.bubbleBg.moveTo(-5, -tailH).lineTo(0, 0).lineTo(5, -tailH).closePath().fill(0xffffff);
                  s.bubbleBg.moveTo(-5, -tailH).lineTo(0, 0).stroke({ width: 1.5, color: 0xe0e7ff });
                  s.bubbleBg.moveTo(5, -tailH).lineTo(0, 0).stroke({ width: 1.5, color: 0xe0e7ff });
                  s.bubbleShowTimer = 3;

                  const expIdx = Math.floor(Math.random() * s.expressions.length);
                  s.char.playExpression(s.expressions[expIdx]);
                }
              }
            }

            // ── 광고 이벤트 트리거 & 표정 유지 ──────────────────────────────
            const now = Date.now();
            if (!adEventRef.current && now >= nextAdEventAtRef.current) {
              const idx = Math.floor(Math.random() * charStates.length);
              adEventRef.current = { charIdx: idx, startedAt: now, duration: 15_000, handled: false, lastExpressionAt: 0 };
              nextAdEventAtRef.current = now + randBetween(60_000, 120_000);
            }
            if (adEventRef.current && !adEventRef.current.handled) {
              const ev = adEventRef.current;
              if (now - ev.lastExpressionAt > 1800) {
                const adState = charStates[ev.charIdx];
                const expIdx = Math.floor(Math.random() * adState.expressions.length);
                adState.char.playExpression(adState.expressions[expIdx]);
                ev.lastExpressionAt = now;
              }
              if (now - ev.startedAt > ev.duration) {
                adEventRef.current = null;
              }
            }
          });

          // Store cleanup via ref (no side-channel on app)
          cleanupRef.current = () => {
            resizeOb.disconnect();
            for (const s of charStates) s.char.dispose();
            charStatesRef.current = null;
            billboardRef.current = null;
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
      // Fire-and-forget unregister (module may not be imported yet if destroyed early)
      void import('../game/SpineCharacterLite').then(({ setSpineLoadProgress }) => setSpineLoadProgress(null)).catch(() => {});
      try {
        cleanupRef.current?.();
        cleanupRef.current = null;
        app.destroy(true, { children: true, texture: true });
      } catch { /* */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t is accessed via tRef to avoid full scene teardown on language change
  }, [visible]);

  // Live-update text when language changes (no scene teardown)
  useEffect(() => {
    // Update billboard text
    const bb = billboardRef.current;
    if (bb) bb.lbl.text = t('home.heroDesc');

    // Update character name tags & bubble texts
    const states = charStatesRef.current;
    if (states) {
      for (let i = 0; i < states.length; i++) {
        const cfg = AGENT_SPINE_CONFIGS[i];
        const s = states[i];
        // Update name tag text (first Text child inside nameTag container)
        const nameText = s.nameTag.children[1] as Text;
        if (nameText) nameText.text = t(cfg.nameKey);
        // Update cached bubble strings
        s.bubbles = cfg.bubbleKeys.map((k) => t(k));
      }
    }
  }, [t]);

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
          <StatsStrip stats={stats} recoveryRate={recoveryRate} />
        </div>
      </section>
    );
  }

  const sectionH = isMobile ? MOBILE_SCENE_H : SCENE_H;

  return (
    <section className="border-b border-primary-100" style={{ position: 'relative', height: sectionH, overflow: 'hidden', backgroundColor: '#1e1b4b' }}>
      {/* Pixi canvas — fades in as scene loads, always SCENE_H tall */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, height: SCENE_H }}>
        <canvas ref={canvasRef} style={{ display: 'block', opacity: phase !== 'init' ? 1 : 0, transition: 'opacity 1s ease' }} />
      </div>

      {/* Loading overlay — silhouettes + progress + typing message */}
      <HeroLoadingOverlay
        progress={loadProgress}
        total={5}
        visible={phase !== 'ready'}
      />

      {/* BGM toggle — 좌상단 아이콘 (항상 고정) */}
      <button
        onClick={handleBgmToggle}
        className={`absolute left-2 top-2 z-20 w-8 h-8 flex items-center justify-center rounded-full border transition-all ${
          bgmOn
            ? 'bg-primary-600 border-primary-500 text-white shadow-md hover:bg-primary-700'
            : 'bg-white/80 border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
        }`}
        style={{ opacity: phase === 'ready' ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}
        aria-label={bgmOn ? t('home.bgmOff') : t('home.bgmOn')}
      >
        {bgmOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>

      {/* 모바일: 게임해서 후원 — Lv 배지 위 정사각형 버튼 */}
      {isMobile && (
        <Link
          to="/game"
          className="absolute left-2 z-20 w-12 h-12 flex items-center justify-center rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 shadow-sm transition-all"
          style={{ bottom: 42, opacity: phase === 'ready' ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}
          aria-label={t('home.playToSponsor')}
        >
          <Gamepad2 className="w-5 h-5" aria-hidden="true" />
        </Link>
      )}

      {/* Buttons — 데스크탑: 상단 중앙 가로 / 모바일: 우측 세로 2개 */}
      <div
        className={`absolute flex z-20 ${isMobile ? 'flex-col gap-2 items-end' : 'inset-x-0 flex-row justify-center gap-3 px-3'}`}
        style={{
          ...(isMobile ? { bottom: 10, right: 12 } : { top: 16 }),
          pointerEvents: 'none',
          opacity: phase === 'ready' ? 1 : 0,
          transition: 'opacity 0.6s ease 0.2s',
        }}
      >
        {!isMobile && (
          <Link
            to="/game"
            className="inline-flex items-center gap-2 border border-amber-300 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg font-semibold text-sm transition-all hover:-translate-y-0.5 px-5 py-2.5"
            style={{ pointerEvents: 'auto' }}
          >
            <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" /> {t('home.playToSponsor')}
          </Link>
        )}
        <Link
          to="/reports/new"
          className={`inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold text-sm transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 ${isMobile ? 'px-4 py-2.5 w-52 justify-center' : 'px-5 py-2.5'}`}
          style={{ pointerEvents: 'auto' }}
        >
          {t('home.newReport')} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
        <Link
          to="/browse"
          className={`inline-flex items-center gap-2 border border-gray-200 hover:border-gray-300 bg-white/90 hover:bg-white text-gray-700 rounded-lg font-semibold text-sm transition-all hover:-translate-y-0.5 ${isMobile ? 'px-4 py-2.5 w-52 justify-center' : 'px-5 py-2.5'}`}
          style={{ pointerEvents: 'auto' }}
        >
          {t('home.submitSighting')}
        </Link>
      </div>

      {/* StatsStrip — positioned at billboard top (synced by Pixi effect) */}
      <div ref={statsRef} className="absolute z-20" style={{ transform: 'translate(-50%, -100%)', pointerEvents: 'auto', opacity: phase === 'ready' ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}>
        <StatsStrip stats={stats} recoveryRate={recoveryRate} />
      </div>

      {/* XP 레벨 배지 */}
      {xpStats && phase === 'ready' && (
        <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5 bg-white/85 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-indigo-100">
          <span className="text-xs font-bold text-indigo-700">⭐ Lv.{xpStats.userLevel}</span>
          <div className="w-14 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${xpStats.xpRequiredForLevel > 0 ? Math.round((xpStats.currentXP / xpStats.xpRequiredForLevel) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 광고 이벤트 클릭 버튼 (캐릭터 머리 위) */}
      {adEventDisplay && phase === 'ready' && (
        <button
          onClick={() => { void handleAdClick(); }}
          style={{
            position: 'absolute',
            left: adEventDisplay.x - 36,
            top: CHAR_Y - 125,
            zIndex: 30,
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
          }}
          className="flex flex-col items-center gap-0.5 animate-bounce"
          aria-label={t('home.adReward.ariaLabel')}
        >
          <span style={{ fontSize: 26 }}>🎁</span>
          <span className="text-[10px] font-bold bg-yellow-400 text-yellow-900 rounded px-1.5 py-0.5 whitespace-nowrap shadow-sm">
            {t('home.adReward.button')}
          </span>
        </button>
      )}

      {/* XP 획득 토스트 */}
      {xpToast && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-40 bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg animate-bounce whitespace-nowrap">
          {xpToast}
        </div>
      )}
    </section>
  );
}

function StatsStrip({ stats, recoveryRate }: { stats: Props['stats']; recoveryRate: number | null }) {
  const { t } = useTranslation();
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
