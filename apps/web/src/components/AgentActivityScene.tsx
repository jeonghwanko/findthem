import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Application, Graphics, Text, TextStyle, Container, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';
import type { AgentActivityEvent } from '@findthem/shared';
import { useAgentActivity } from '../hooks/useAgentActivity';
import { computeLayout, drawScene, roomCenter, tileToPixel } from '@findthem/pixi-scenes/game';
import { AgentActivityOverlay } from '@findthem/pixi-scenes/components';

extensions.add(SpinePipe);

// ── 에이전트 Spine 설정 (PixiHeroScene과 동일) ──
const AGENT_SPINE_CONFIGS = [
  {
    id: 'image-matching' as const,
    roomKey: 'claude' as const,
    skins: ['body_090', 'cos_090', 'hair_090', 'hat_090', 'weapon_090'] as const,
    scale: 0.15,
    expressions: ['expression_thinking_2', 'expression_surprise_1'] as const,
    workIcon: '🔍',
    nameKey: 'agentScene.claude.name',
  },
  {
    id: 'promotion' as const,
    roomKey: 'heimi' as const,
    skins: ['body_102', 'cos_102', 'hair_102', 'hat_102', 'weapon_102'] as const,
    scale: 0.15,
    expressions: ['expression_fun', 'expression_preen'] as const,
    workIcon: '📣',
    nameKey: 'agentScene.heimi.name',
  },
  {
    id: 'chatbot-alert' as const,
    roomKey: 'ali' as const,
    skins: ['body_043', 'cos_042', 'hair_000', 'hat_042', 'weapon_042'] as const,
    scale: 0.15,
    expressions: ['expression_joke_1', 'expression_surprise_1'] as const,
    workIcon: '📋',
    nameKey: 'agentScene.ali.name',
  },
] as const;

const SCENE_H = 280;

// ── 에이전트 상태 ──
interface AgentState {
  char: import('@findthem/pixi-scenes/game').SpineCharacterLite;
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
          antialias: true,
          autoDensity: true,
          resolution: dpr,
          roundPixels: true,
          preference: 'webgl',
          autoStart: false,
        });
        if (destroyed) return;

        await document.fonts.ready;

        // ── 방 배경 ──
        const layout = computeLayout(W, H);
        const roomLayer = new Container();
        app.stage.addChild(roomLayer);
        drawScene(roomLayer, layout);

        if (!destroyed) setPhase('loading');

        // prefers-reduced-motion
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          if (!destroyed) setPhase('ready');
          app.ticker.addOnce(() => app.ticker.stop());
          app.ticker.start();
          return;
        }

        app.ticker.stop();

        // ── Spine 캐릭터 로드 ──
        const { SpineCharacterLite } = await import('@findthem/pixi-scenes/game');
        if (destroyed) return;

        const chars = await Promise.all(
          AGENT_SPINE_CONFIGS.map((c) => SpineCharacterLite.create(c.skins)),
        );
        if (destroyed) return;

        const charLayer = new Container();
        app.stage.addChild(charLayer);

        const uiLayer = new Container();
        app.stage.addChild(uiLayer);

        // ── 에이전트 상태 초기화 ──
        const agentStates: AgentState[] = AGENT_SPINE_CONFIGS.map((cfg, i) => {
          const char = chars[i];
          const center = roomCenter(cfg.roomKey, layout);
          char.setScale(cfg.scale);
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
          nameTag.position.set(center.x, center.y + 20);
          uiLayer.addChild(nameTag);

          // 작업 아이콘 (평소 숨김)
          const iconStyle = new TextStyle({ fontSize: 18 });
          const workIcon = new Text({ text: cfg.workIcon, style: iconStyle });
          workIcon.anchor.set(0.5, 1);
          workIcon.position.set(center.x, center.y - 30);
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
          bubble.position.set(center.x, center.y - 48);
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
            speed: 40,
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
              // eventType 기반으로 에이전트 매핑
              if (evt.eventType === 'match_detected') return 0;
              if (evt.eventType === 'outreach_sent') return 1;
              return 2;
            })();
            const state = agentStates[idx];
            if (state && !state.isWorking) {
              state.isWorking = true;
              state.workTimer = randBetween(3, 5);
              const cfg = AGENT_SPINE_CONFIGS[idx];
              const expr = cfg.expressions[Math.floor(Math.random() * cfg.expressions.length)];
              state.char.playExpression(expr);
              state.workIcon.alpha = 1;
              showBubble(state, getEventBubbleText(evt, tRef.current), 4);
            }
          }

          for (let i = 0; i < agentStates.length; i++) {
            const state = agentStates[i];
            const cfg = AGENT_SPINE_CONFIGS[i];

            // Spine 업데이트
            state.char.tick(dt);

            // ── 작업 상태 ──
            if (state.isWorking) {
              state.workTimer -= dt;
              // 작업 아이콘 바운스
              state.workIcon.position.y = state.y - 30 + Math.sin(Date.now() / 200) * 3;
              if (state.workTimer <= 0) {
                state.isWorking = false;
                state.workIcon.alpha = 0;
                state.char.setBodyAnimation('idle', true);
                state.idleTimer = randBetween(6, 12);
              }
            } else {
              // ── 유휴 패트롤 ──
              state.patrolTimer -= dt;
              if (state.patrolTimer <= 0) {
                // 방 안 랜덤 위치로 이동
                const room = layout.rooms[cfg.roomKey];
                const s = layout.scale * 16;
                const { x: rx, y: ry } = tileToPixel(room.x, room.y, layout);
                const margin = s * 0.8;
                state.targetX = clamp(
                  rx + margin + Math.random() * (room.w * s - margin * 2),
                  rx + margin,
                  rx + room.w * s - margin,
                );
                state.targetY = clamp(
                  ry + margin + Math.random() * (room.h * s - margin * 2),
                  ry + s * 2,
                  ry + room.h * s - margin,
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
                // run 애니메이션이 있으면 재생
                state.char.playBodyAnimSafe('run_1', true);
              } else {
                state.char.setBodyAnimation('idle', true);
              }

              // 유휴 expression
              state.idleTimer -= dt;
              if (state.idleTimer <= 0) {
                const expr = cfg.expressions[Math.floor(Math.random() * cfg.expressions.length)];
                state.char.playExpression(expr);
                state.idleTimer = randBetween(8, 15);
              }
            }

            // ── 이름 태그 위치 동기화 ──
            state.nameTag.position.set(state.x, state.y + 20);

            // ── 말풍선 페이드 ──
            if (state.bubbleShowTimer > 0) {
              state.bubbleShowTimer -= dt;
              state.bubble.position.set(state.x, state.y - 48);
              state.bubble.alpha = Math.min(state.bubbleAlpha, state.bubbleShowTimer > 0.3 ? 1 : state.bubbleShowTimer / 0.3);
            } else {
              state.bubble.alpha = 0;
            }
          }
        });

        app.ticker.start();
        if (!destroyed) setPhase('ready');
      } catch {
        // Pixi/Spine 로드 실패 시 조용히 무시
      }
    })();

    return () => {
      destroyed = true;
      app.destroy(true, { children: true });
    };
  }, [visible, pendingEventsRef]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ minHeight: SCENE_H }}>
      {/* Pixi Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ height: SCENE_H, imageRendering: 'pixelated' }}
      />

      {/* 로딩 상태 */}
      {phase !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50/80">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-amber-700">{t('agentScene.loading')}</p>
          </div>
        </div>
      )}

      {/* HTML 오버레이 — 일일 통계 + 활동 로그 */}
      {phase === 'ready' && (
        <AgentActivityOverlay agents={agents} isLoading={isLoading} />
      )}
    </div>
  );
}
