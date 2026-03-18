import { useEffect, useRef } from 'react';
import { Application, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';
import { SpineCharacterLite } from '../game/SpineCharacterLite';

// Register SpinePipe (idempotent — safe to call multiple times)
extensions.add(SpinePipe);

interface Props {
  skins: readonly string[];
  /** Canvas size in CSS px (width = height). default: 80 */
  size?: number;
  /** Canvas width override (px). Takes precedence over size for width. */
  width?: number;
  /** Canvas height override (px). Takes precedence over size for height. */
  height?: number;
  /** false = 포즈가 잡히면 애니메이션 정지 (정적 썸네일용). default: true */
  animate?: boolean;
  /** true = 전신 표시 (발~머리 전체). false = 흉상 클로즈업(기본). */
  fullBody?: boolean;
  /** true = preserveDrawingBuffer 활성화 → canvas.toBlob() 캡처 가능. 성능 비용 있으므로 캡처 도구에서만 사용. */
  enableCapture?: boolean;
  className?: string;
}

/**
 * Renders a Spine character portrait (face/bust crop) in a small Pixi canvas.
 * Transparent background — overlay on any card background.
 */
export function SpinePortrait({ skins, size = 80, width, height, animate = true, fullBody = false, enableCapture = false, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasW = width ?? size;
  const canvasH = height ?? size;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let app: Application | null = null;
    let char: SpineCharacterLite | null = null;
    let destroyed = false;
    let stopTimerId: number | undefined;

    void (async () => {
      try {
        app = new Application();
        await app.init({
          canvas,
          width: canvasW,
          height: canvasH,
          backgroundAlpha: 0,
          autoStart: false,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          preserveDrawingBuffer: enableCapture, // true = canvas.toBlob() 캡처 가능 (성능 비용 있음)
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

        if (fullBody) {
          // 전신 표시: 발을 캔버스 하단에, 스케일 축소
          char.setPosition(canvasW / 2, canvasH * 0.92);
          char.setScale(0.20 * (canvasH / 80));
        } else {
          // 흉상 클로즈업 (기존 동작)
          char.setPosition(canvasW / 2, canvasH * 1.375);
          char.setScale(0.38 * (canvasH / 80));
        }
        app.stage.addChild(char.view);

        app.ticker.add((ticker) => {
          char?.tick(ticker.deltaMS / 1000);
        });
        app.ticker.start();

        // 정적 모드: 포즈가 안정될 때까지 몇 프레임 돌린 뒤 정지
        if (!animate) {
          stopTimerId = window.setTimeout(() => { if (!destroyed) app?.ticker.stop(); }, 200);
        }
      } catch {
        // Portrait fails silently — caller shows fallback icon
      }
    })();

    return () => {
      destroyed = true;
      clearTimeout(stopTimerId);
      app?.ticker?.stop();
      char?.dispose();
      try { app?.destroy(); } catch { /* init 미완료 상태에서 destroy 무시 */ }
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
      style={{ width: canvasW, height: canvasH, display: 'block' }}
    />
  );
}
