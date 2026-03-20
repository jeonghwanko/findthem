import { useEffect, useRef } from 'react';
import { Application, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';
import { SpineCharacterLite } from '@findthem/pixi-scenes/game';

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

  const appRef = useRef<Application | null>(null);
  const animateRef = useRef(animate);
  animateRef.current = animate;

  // Setup Pixi app + Spine character (mount only)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let char: SpineCharacterLite | null = null;
    let destroyed = false;
    let stopTimerId: number | undefined;

    void (async () => {
      try {
        const app = new Application();
        await app.init({
          canvas,
          width: canvasW,
          height: canvasH,
          backgroundAlpha: 0,
          autoStart: false,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          preserveDrawingBuffer: enableCapture,
        });

        if (destroyed) { app.destroy(); return; }
        appRef.current = app;

        char = await SpineCharacterLite.create(skins);
        if (destroyed) {
          char.dispose();
          app.destroy();
          return;
        }

        if (fullBody) {
          char.setPosition(canvasW / 2, canvasH * 0.92);
          char.setScale(0.20 * (canvasH / 80));
        } else {
          char.setPosition(canvasW / 2, canvasH * 1.375);
          char.setScale(0.38 * (canvasH / 80));
        }
        app.stage.addChild(char.view);

        app.ticker.add((ticker) => {
          char?.tick(ticker.deltaMS / 1000);
        });
        app.ticker.start();

        // 초기 animate=false면 포즈 안정 후 정지
        if (!animateRef.current) {
          stopTimerId = window.setTimeout(() => { if (!destroyed) app.ticker.stop(); }, 200);
        }
      } catch {
        // Portrait fails silently — caller shows fallback icon
      }
    })();

    return () => {
      destroyed = true;
      clearTimeout(stopTimerId);
      const app = appRef.current;
      app?.ticker?.stop();
      char?.dispose();
      try { app?.destroy(); } catch { /* init 미완료 상태에서 destroy 무시 */ }
      appRef.current = null;
      char = null;
    };
    // skins array reference is stable (caller must ensure stable reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // animate prop 변경 시 ticker 시작/정지
  useEffect(() => {
    const app = appRef.current;
    if (!app) return; // 아직 초기화 중이면 무시 (setup effect가 초기 animate 처리)
    let timeoutId: number | undefined;
    if (animate) {
      app.ticker.start();
    } else {
      timeoutId = window.setTimeout(() => appRef.current?.ticker.stop(), 200);
    }
    return () => clearTimeout(timeoutId);
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: canvasW, height: canvasH, display: 'block' }}
    />
  );
}
