import { useEffect, useRef } from 'react';
import { Application, Graphics, Container } from 'pixi.js';
import {
  FolkCharacter,
  drawTiledScene,
  setupTiledDrag,
  centerTiledCamera,
  type TiledSceneLayout,
} from '@findthem/pixi-scenes/game';
import {
  type RoundConfig,
  generateDecoyPositions,
  isNearTarget,
} from './gameLogic';

interface FindThemGameCanvasProps {
  round: RoundConfig;
  foundIds: Set<number>;
  timeRemaining: number;
  onTargetFound: (index: number) => void;
}

const HIT_RADIUS = 28;
const TAP_MAX_MS = 200;
const HINT_START_SECS = 10;
const SPARKLE_DURATION = 0.45;

interface SparkleEffect {
  gfx: Graphics;
  elapsed: number;
}

interface CharEntry {
  char: FolkCharacter;
  isTarget: boolean;
  targetIndex: number;
}

export default function FindThemGameCanvas({
  round,
  foundIds,
  timeRemaining,
  onTargetFound,
}: FindThemGameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFoundRef = useRef(onTargetFound);
  onFoundRef.current = onTargetFound;
  const foundIdsRef = useRef(foundIds);
  foundIdsRef.current = foundIds;
  const timeRef = useRef(timeRemaining);
  timeRef.current = timeRemaining;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const W = parent?.clientWidth || window.innerWidth;
    const H = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

    let app: Application | null = null;
    const chars: CharEntry[] = [];
    const sparkles: SparkleEffect[] = [];
    const hintGfxMap = new Map<number, Graphics>();
    let destroyed = false;
    let pointerDownTime = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;

    async function init() {
      app = new Application();
      await app.init({
        canvas: canvas as HTMLCanvasElement,
        width: W,
        height: H,
        resolution: dpr,
        autoDensity: true,
        background: 0xf5f0e8,
        autoStart: false,
      });

      if (destroyed) { app.destroy(false, { children: true }); return; }

      const roomLayer = new Container();
      app.stage.addChild(roomLayer);
      const charLayer = new Container();
      const effectLayer = new Container();

      let layout: TiledSceneLayout;
      try {
        layout = await drawTiledScene(roomLayer, W, H);
      } catch {
        const bg = new Graphics();
        bg.rect(0, 0, W, H).fill({ color: 0xd4e8c2 });
        roomLayer.addChild(bg);
        layout = {
          world: roomLayer,
          mapW: 140, mapH: 100, tileDim: 32,
          viewportW: W, viewportH: H,
          rooms: {},
          renderBounds: { minX: 0, maxX: W, minY: 0, maxY: H },
        };
      }

      if (destroyed) { app.destroy(false, { children: true }); return; }

      const { tileDim, world } = layout;
      world.addChild(charLayer);
      world.addChild(effectLayer);

      // Spawn targets
      const targetPromises = round.targets.map(async (t, idx) => {
        const char = await FolkCharacter.create(t.charId);
        char.setPosition(t.tileX * tileDim + tileDim / 2, t.tileY * tileDim + tileDim);
        char.play('idle');
        charLayer.addChild(char.view);
        chars.push({ char, isTarget: true, targetIndex: idx });

        // Hint ring (hidden until time is low)
        const hint = new Graphics();
        hint.circle(0, 0, HIT_RADIUS + 6).stroke({ color: 0xffdd00, width: 2 });
        hint.position.set(t.tileX * tileDim + tileDim / 2, t.tileY * tileDim + tileDim / 2);
        hint.alpha = 0;
        effectLayer.addChild(hint);
        hintGfxMap.set(idx, hint);
      });

      // Spawn decoys
      const decoys = generateDecoyPositions(round.targets, round.decoyCount, layout.mapW, layout.mapH);
      const decoyPromises = decoys.map(async (d) => {
        const char = await FolkCharacter.create(d.charId);
        char.setPosition(d.tileX * tileDim + tileDim / 2, d.tileY * tileDim + tileDim);
        char.play('idle');
        charLayer.addChild(char.view);
        chars.push({ char, isTarget: false, targetIndex: -1 });
      });

      await Promise.all([...targetPromises, ...decoyPromises]);
      if (destroyed) { app.destroy(false, { children: true }); return; }

      // Camera: start at offset so targets aren't immediately visible
      const rb = layout.renderBounds;
      const cx = (rb.minX + rb.maxX) / 2 + (Math.random() - 0.5) * W * 0.4;
      const cy = (rb.minY + rb.maxY) / 2 + (Math.random() - 0.5) * H * 0.4;
      centerTiledCamera(cx, cy, layout);

      // Drag
      setupTiledDrag(world, layout, app.stage);

      // Tap detection
      app.stage.on('pointerdown', (e) => {
        pointerDownTime = performance.now();
        pointerDownX = e.global.x;
        pointerDownY = e.global.y;
      });

      app.stage.on('pointerup', (e) => {
        const elapsed = performance.now() - pointerDownTime;
        const dx = e.global.x - pointerDownX;
        const dy = e.global.y - pointerDownY;
        if (elapsed > TAP_MAX_MS || Math.sqrt(dx * dx + dy * dy) > 10) return;

        const worldX = e.global.x - world.x;
        const worldY = e.global.y - world.y;

        round.targets.forEach((target, idx) => {
          if (foundIdsRef.current.has(idx)) return;
          if (isNearTarget(worldX, worldY, target, tileDim, HIT_RADIUS)) {
            // Visual: tint green
            const entry = chars.find((c) => c.isTarget && c.targetIndex === idx);
            if (entry) entry.char.setTint(0x88ff88);
            // Hide hint
            const h = hintGfxMap.get(idx);
            if (h) h.alpha = 0;
            // Sparkle
            const sg = new Graphics();
            sg.position.set(target.tileX * tileDim + tileDim / 2, target.tileY * tileDim + tileDim / 2);
            effectLayer.addChild(sg);
            sparkles.push({ gfx: sg, elapsed: 0 });

            onFoundRef.current(idx);
          }
        });
      });

      // Ticker
      app.ticker.add((ticker) => {
        const dt = ticker.deltaMS / 1000;

        // Tick characters
        for (const entry of chars) entry.char.tick(dt);

        // Hint pulse when time is low
        const tr = timeRef.current;
        if (tr <= HINT_START_SECS && tr > 0) {
          const pulse = 0.35 + 0.35 * Math.sin(Date.now() / 150);
          hintGfxMap.forEach((gfx, idx) => {
            if (!foundIdsRef.current.has(idx)) gfx.alpha = pulse;
          });
        }

        // Animate sparkles
        for (let i = sparkles.length - 1; i >= 0; i--) {
          const sp = sparkles[i];
          sp.elapsed += dt;
          const p = sp.elapsed / SPARKLE_DURATION;
          if (p >= 1) {
            effectLayer.removeChild(sp.gfx);
            sp.gfx.destroy();
            sparkles.splice(i, 1);
            continue;
          }
          const scale = 0.4 + p * 1.8;
          sp.gfx.clear();
          sp.gfx.circle(0, 0, 20 * scale).fill({ color: 0xffee44, alpha: (1 - p) * 0.7 });
          sp.gfx.circle(0, 0, 10 * scale).fill({ color: 0xffffff, alpha: 1 - p });
        }
      });

      app.ticker.start();
    }

    void init();

    return () => {
      destroyed = true;
      if (app) {
        try {
          app.ticker?.stop();
          for (const entry of chars) entry.char.dispose();
          hintGfxMap.forEach((g) => g.destroy());
          sparkles.forEach((s) => s.gfx.destroy());
          app.destroy(false, { children: true });
        } catch {
          // app may be partially initialized
        }
        app = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  );
}
