import { useEffect, useRef } from 'react';
import { Application, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';
import { SpineCharacterLite } from '../game/SpineCharacterLite';

// Register SpinePipe (idempotent — safe to call multiple times)
extensions.add(SpinePipe);

const SIZE = 80; // CSS px; actual resolution scales with devicePixelRatio

interface Props {
  skins: readonly string[];
  /** false = 포즈가 잡히면 애니메이션 정지 (정적 썸네일용). default: true */
  animate?: boolean;
  className?: string;
}

/**
 * Renders a Spine character portrait (face/bust crop) in a small Pixi canvas.
 * Transparent background — overlay on any card background.
 */
export function SpinePortrait({ skins, animate = true, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let app: Application | null = null;
    let char: SpineCharacterLite | null = null;
    let destroyed = false;

    void (async () => {
      try {
        app = new Application();
        await app.init({
          canvas,
          width: SIZE,
          height: SIZE,
          backgroundAlpha: 0,
          autoStart: false,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        if (destroyed) {
          app.destroy();
          return;
        }

        char = await SpineCharacterLite.create(skins);
        if (destroyed) {
          char.dispose();
          // app may already be destroyed by cleanup; only destroy if still alive
          if (app) app.destroy();
          return;
        }

        // Position feet well below canvas so only face/bust is visible
        char.setPosition(SIZE / 2, SIZE + 30);
        char.setScale(0.38);
        app.stage.addChild(char.view);

        app.ticker.add((ticker) => {
          char?.tick(ticker.deltaMS / 1000);
        });
        app.ticker.start();

        // 정적 모드: 포즈가 안정될 때까지 몇 프레임 돌린 뒤 정지
        if (!animate) {
          setTimeout(() => { if (!destroyed) app?.ticker.stop(); }, 200);
        }
      } catch {
        // Portrait fails silently — caller shows fallback icon
      }
    })();

    return () => {
      destroyed = true;
      app?.ticker.stop();
      char?.dispose();
      app?.destroy();
      app = null;
      char = null;
    };
    // skins array reference is stable (defined as const in AGENTS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: SIZE, height: SIZE, display: 'block' }}
    />
  );
}
