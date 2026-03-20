import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import type { AgentActivityEvent } from '@findthem/shared';
import { useAgentActivity } from '../hooks/useAgentActivity';
import { drawTileScene, tileToPx, tileRoomCenter, computeLayout, drawScene, roomCenter, tileToPixel, type TileRoomLayout, type RoomLayout } from '@findthem/pixi-scenes/game';
import { AgentActivityOverlay } from '@findthem/pixi-scenes/components';

// ── 에이전트 설정 (Spine → PixelCharacter) ──
const AGENT_CONFIGS = [
  {
    id: 'image-matching' as const,
    roomKey: 'claude' as const,
    charName: 'Adam' as const,  // 탐정 클로드
    workIcon: '🔍',
    nameKey: 'agentScene.claude.name',
  },
  {
    id: 'promotion' as const,
    roomKey: 'heimi' as const,
    charName: 'Amelia' as const, // 홍보왕 헤르미
    workIcon: '📣',
    nameKey: 'agentScene.heimi.name',
  },
  {
    id: 'chatbot-alert' as const,
    roomKey: 'ali' as const,
    charName: 'Alex' as const,  // 안내봇 알리
    workIcon: '📋',
    nameKey: 'agentScene.ali.name',
  },
] as const;

const SCENE_H = 480;

// ── 레이아웃 어댑터 (TileMap / Graphics fallback 통합) ──
interface SceneLayout {
  getCenter(roomKey: 'claude' | 'heimi' | 'ali'): { x: number; y: number };
  getRoomBounds(roomKey: 'claude' | 'heimi' | 'ali'): { x: number; y: number; w: number; h: number };
  tileSize: number;
}

function tileLayout(l: TileRoomLayout): SceneLayout {
  const td = l.tileDim ?? 48;
  return {
    getCenter: (k) => tileRoomCenter(k, l),
    getRoomBounds: (k) => {
      const r = l.rooms[k];
      const pos = tileToPx(r.x, r.y, l);
      const s = td * l.scale;
      return { x: pos.x, y: pos.y, w: r.w * s, h: r.h * s };
    },
    tileSize: td * l.scale,
  };
}

function graphicsLayout(l: RoomLayout): SceneLayout {
  const s = l.scale * 16;
  return {
    getCenter: (k) => roomCenter(k, l),
    getRoomBounds: (k) => {
      const r = l.rooms[k];
      const pos = tileToPixel(r.x, r.y, l);
      return { x: pos.x, y: pos.y, w: r.w * s, h: r.h * s };
    },
    tileSize: s,
  };
}

// ── 에이전트 상태 ──
interface AgentState {
  char: import('@findthem/pixi-scenes/game').PixelCharacter;
  nameTag: Text;
  bubble: Container;
  bubbleText: Text;
  bubbleBg: Graphics;
  workIcon: Text;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  isWorking: boolean;
  workTimer: number;
  idleTimer: number;
  bubbleAlpha: number;
  bubbleShowTimer: number;
  patrolTimer: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function randBetween(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

/** 이벤트 타입에 따른 말풍선 텍스트 */
function getEventBubbleText(evt: AgentActivityEvent, t: (k: string) => string): string {
  switch (evt.eventType) {
    case 'match_detected': return t('agentScene.bubble.matchDetected');
    case 'outreach_sent': return t('agentScene.bubble.outreachSent');
    case 'report_created': return t('agentScene.bubble.reportCreated');
    case 'sighting_analyzed': return t('agentScene.bubble.sightingAnalyzed');
    case 'case_resolved': return t('agentScene.bubble.caseResolved');
    default: return t('agentScene.bubble.working');
  }
}

export default function AgentActivityScene() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'init' | 'loading' | 'ready'>('init');
  const [visible, setVisible] = useState(false);
  const { agents, pendingEventsRef, isLoading } = useAgentActivity(visible);

  // IntersectionObserver — 뷰포트 진입 시 로드
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

  // ── Pixi 씬 초기화 ──
  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const tr = tRef.current;
    let destroyed = false;
    const app = new Application();

    void (async () => {
      try {
        const W = container.clientWidth || 800;
        const H = SCENE_H;
        const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

        await app.init({
          canvas,
          width: W,
          height: H,
          background: 0xf5f0e8,
          antialias: false,
          autoDensity: true,
          resolution: dpr,
          roundPixels: true,
          preference: 'webgl',
          autoStart: false,
        });
        if (destroyed) return;

        // ── 배경 (타일맵 우선, 실패 시 Graphics fallback) ──
        const roomLayer = new Container();
        app.stage.addChild(roomLayer);

        let scene: SceneLayout;
        try {
          const tl = await drawTileScene(roomLayer, W, H);
          scene = tileLayout(tl);
        } catch {
          const gl = computeLayout(W, H);
          drawScene(roomLayer, gl);
          scene = graphicsLayout(gl);
        }
        if (destroyed) return;

        if (!destroyed) setPhase('loading');

        // prefers-reduced-motion
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          if (!destroyed) setPhase('ready');
          app.ticker.addOnce(() => app.ticker.stop());
          app.ticker.start();
          return;
        }

        app.ticker.stop();

        // ── 픽셀 캐릭터 로드 (Spine 대신) ──
        const { PixelCharacter } = await import('@findthem/pixi-scenes/game');
        if (destroyed) return;

        const chars = await Promise.all(
          AGENT_CONFIGS.map((c) => PixelCharacter.create(c.charName)),
        );
        if (destroyed) return;

        const charLayer = new Container();
        app.stage.addChild(charLayer);

        const uiLayer = new Container();
        app.stage.addChild(uiLayer);

        // ── 에이전트 상태 초기화 ──
        const agentStates: AgentState[] = AGENT_CONFIGS.map((cfg, i) => {
          const char = chars[i];
          const center = scene.getCenter(cfg.roomKey);
          char.setPosition(center.x, center.y);
          charLayer.addChild(char.view);

          // 이름 태그
          const nameStyle = new TextStyle({
            fontSize: 10,
            fontFamily: 'sans-serif',
            fill: 0x554433,
            align: 'center',
            fontWeight: 'bold',
          });
          const nameTag = new Text({ text: tr(cfg.nameKey), style: nameStyle });
          nameTag.anchor.set(0.5, 0);
          nameTag.position.set(center.x, center.y + 4);
          uiLayer.addChild(nameTag);

          // 작업 아이콘 (평소 숨김)
          const iconStyle = new TextStyle({ fontSize: 16 });
          const workIcon = new Text({ text: cfg.workIcon, style: iconStyle });
          workIcon.anchor.set(0.5, 1);
          workIcon.position.set(center.x, center.y - char.pixelHeight - 4);
          workIcon.alpha = 0;
          uiLayer.addChild(workIcon);

          // 말풍선
          const bubble = new Container();
          bubble.alpha = 0;
          const bubbleBg = new Graphics();
          const bubbleTextStyle = new TextStyle({
            fontSize: 9,
            fontFamily: 'sans-serif',
            fill: 0x333333,
            wordWrap: true,
            wordWrapWidth: 100,
            align: 'center',
          });
          const bubbleText = new Text({ text: '', style: bubbleTextStyle });
          bubbleText.anchor.set(0.5, 0.5);
          bubble.addChild(bubbleBg);
          bubble.addChild(bubbleText);
          bubble.position.set(center.x, center.y - char.pixelHeight - 20);
          uiLayer.addChild(bubble);

          return {
            char,
            nameTag,
            bubble,
            bubbleText,
            bubbleBg,
            workIcon,
            homeX: center.x,
            homeY: center.y,
            x: center.x,
            y: center.y,
            targetX: center.x,
            targetY: center.y,
            speed: 30,
            isWorking: false,
            workTimer: 0,
            idleTimer: randBetween(5, 12),
            bubbleAlpha: 0,
            bubbleShowTimer: 0,
            patrolTimer: randBetween(4, 10),
          };
        });

        // 이벤트 큐 (Pixi ticker에서 소비)
        const eventQueueRef = pendingEventsRef;

        // 말풍선 배경 갱신
        const refreshBubbleBg = (state: AgentState) => {
          const bg = state.bubbleBg;
          bg.clear();
          const tw = state.bubbleText.width + 16;
          const th = state.bubbleText.height + 10;
          bg.roundRect(-tw / 2, -th / 2, tw, th, 6).fill(0xffffffdd);
          bg.roundRect(-tw / 2, -th / 2, tw, th, 6).stroke({ color: 0xccbbaa, width: 1 });
        };

        // 말풍선 표시
        const showBubble = (state: AgentState, text: string, duration = 3) => {
          state.bubbleText.text = text;
          refreshBubbleBg(state);
          state.bubbleShowTimer = duration;
          state.bubbleAlpha = 1;
        };

        // 에이전트 ID → 인덱스
        const agentIdxMap: Record<string, number> = {
          'image-matching': 0,
          'promotion': 1,
          'chatbot-alert': 2,
        };

        // ── Ticker 루프 ──
        app.ticker.add((ticker) => {
          const dt = ticker.deltaMS / 1000;

          // 이벤트 큐 소비 (프레임당 1개)
          if (eventQueueRef.current.length > 0) {
            const evt = eventQueueRef.current.shift()!;
            const idx = agentIdxMap[evt.id] ?? (() => {
              if (evt.eventType === 'match_detected') return 0;
              if (evt.eventType === 'outreach_sent') return 1;
              return 2;
            })();
            const state = agentStates[idx];
            if (state && !state.isWorking) {
              state.isWorking = true;
              state.workTimer = randBetween(3, 5);
              // 작업 중 phone 애니메이션
              state.char.play('phone');
              state.workIcon.alpha = 1;
              showBubble(state, getEventBubbleText(evt, tRef.current), 4);
            }
          }

          for (let i = 0; i < agentStates.length; i++) {
            const state = agentStates[i];
            const cfg = AGENT_CONFIGS[i];

            // 스프라이트 애니메이션 업데이트
            state.char.tick(dt);

            // ── 작업 상태 ──
            if (state.isWorking) {
              state.workTimer -= dt;
              state.workIcon.position.y = state.y - state.char.pixelHeight - 4 + Math.sin(Date.now() / 200) * 3;
              if (state.workTimer <= 0) {
                state.isWorking = false;
                state.workIcon.alpha = 0;
                state.char.play('idle');
                state.idleTimer = randBetween(6, 12);
              }
            } else {
              // ── 유휴 패트롤 ──
              state.patrolTimer -= dt;
              if (state.patrolTimer <= 0) {
                const bounds = scene.getRoomBounds(cfg.roomKey);
                const margin = scene.tileSize * 0.8;
                state.targetX = clamp(
                  bounds.x + margin + Math.random() * (bounds.w - margin * 2),
                  bounds.x + margin,
                  bounds.x + bounds.w - margin,
                );
                state.targetY = clamp(
                  bounds.y + margin + Math.random() * (bounds.h - margin * 2),
                  bounds.y + scene.tileSize * 2,
                  bounds.y + bounds.h - margin,
                );
                state.patrolTimer = randBetween(5, 15);
              }

              // 이동
              const dx = state.targetX - state.x;
              const dy = state.targetY - state.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 2) {
                const step = state.speed * dt;
                state.x += (dx / dist) * Math.min(step, dist);
                state.y += (dy / dist) * Math.min(step, dist);
                state.char.setPosition(state.x, state.y);
                state.char.setFlipX(dx < 0);
                state.char.play('run');
              } else {
                state.char.play('idle');
              }

              // 유휴 시 가끔 sit
              state.idleTimer -= dt;
              if (state.idleTimer <= 0) {
                state.char.play('sit');
                state.idleTimer = randBetween(8, 15);
                // 3초 후 idle로 복귀
                setTimeout(() => { if (!state.isWorking) state.char.play('idle'); }, 3000);
              }
            }

            // ── 이름 태그 위치 동기화 ──
            state.nameTag.position.set(state.x, state.y + 4);

            // ── 말풍선 페이드 ──
            if (state.bubbleShowTimer > 0) {
              state.bubbleShowTimer -= dt;
              state.bubble.position.set(state.x, state.y - state.char.pixelHeight - 20);
              state.bubble.alpha = Math.min(state.bubbleAlpha, state.bubbleShowTimer > 0.3 ? 1 : state.bubbleShowTimer / 0.3);
            } else {
              state.bubble.alpha = 0;
            }
          }
        });

        app.ticker.start();
        if (!destroyed) setPhase('ready');
      } catch {
        // Pixi 로드 실패 시 조용히 무시
      }
    })();

    return () => {
      destroyed = true;
      app.destroy(true, { children: true });
    };
  }, [visible, pendingEventsRef]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ minHeight: SCENE_H }}>
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ height: SCENE_H, imageRendering: 'pixelated' }}
      />

      {phase !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50/80">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-amber-700">{t('agentScene.loading')}</p>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <AgentActivityOverlay agents={agents} isLoading={isLoading} />
      )}
    </div>
  );
}
