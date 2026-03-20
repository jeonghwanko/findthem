import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import type { AgentActivityEvent } from '@findthem/shared';
import { useAgentActivity } from '../hooks/useAgentActivity';
import { drawTileScene, tileToPx, tileRoomCenter, setupDrag, computeLayout, drawScene, roomCenter, tileToPixel, type TileRoomLayout, type RoomLayout } from '@findthem/pixi-scenes/game';
import { AgentActivityOverlay } from '@findthem/pixi-scenes/components';

// ── 에이전트 설정 (FolkCharacter 32px) ──
const AGENT_CONFIGS = [
  {
    id: 'image-matching' as const,
    roomKey: 'claude' as const,
    folkId: 1,   // 탐정 클로드
    workIcon: '🔍',
    nameKey: 'agentScene.claude.name',
  },
  {
    id: 'promotion' as const,
    roomKey: 'heimi' as const,
    folkId: 6,   // 홍보왕 헤르미 (핑크)
    workIcon: '📣',
    nameKey: 'agentScene.heimi.name',
  },
  {
    id: 'chatbot-alert' as const,
    roomKey: 'ali' as const,
    folkId: 3,   // 안내봇 알리
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
  const td = l.tileDim;
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

// ── 퀘스트 페이즈 ──
type QuestPhase = 'idle' | 'going_to_board' | 'at_board' | 'going_to_work' | 'working' | 'complete';

// ── 더미 퀘스트 텍스트 ──
const DUMMY_QUESTS: Record<string, { working: string; done: string }[]> = {
  'image-matching': [
    { working: '🔍 사진 분석 중... 87%', done: '✅ 매칭 완료! 유사도 92%' },
    { working: '🔍 특징 추출 중...', done: '✅ 분석 완료! 3건 매칭' },
    { working: '🔍 이미지 비교 중...', done: '✅ 후보 5건 발견!' },
  ],
  promotion: [
    { working: '📣 홍보글 작성 중...', done: '✅ 트위터 게시 완료!' },
    { working: '📣 카카오 채널 전송 중...', done: '✅ 카카오 홍보 완료!' },
    { working: '📣 해시태그 생성 중...', done: '✅ SNS 확산 시작!' },
  ],
  'chatbot-alert': [
    { working: '📋 제보 접수 확인 중...', done: '✅ 신고자에게 알림 발송!' },
    { working: '📋 위치 정보 분석 중...', done: '✅ 목격 지역 등록 완료!' },
    { working: '📋 챗봇 응답 생성 중...', done: '✅ 안내 메시지 전송!' },
  ],
};

// ── 에이전트 상태 ──
interface AgentState {
  char: import('@findthem/pixi-scenes/game').FolkCharacter;
  nameTag: Container;
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
  idleTimer: number;
  bubbleAlpha: number;
  bubbleShowTimer: number;
  patrolTimer: number;
  // 퀘스트 시스템
  questPhase: QuestPhase;
  questTimer: number;
  questIdx: number; // DUMMY_QUESTS 인덱스
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
        let worldContainer: Container | null = null;
        try {
          const tl = await drawTileScene(roomLayer, W, H);
          scene = tileLayout(tl);
          worldContainer = tl.world;
          // 드래그를 app.stage에 바인딩 (캐릭터/UI 위에서도 동작)
          setupDrag(tl.world, tl, app.stage);
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

        // ── Folk 캐릭터 로드 (32px, ai-town 스타일) ──
        const { FolkCharacter } = await import('@findthem/pixi-scenes/game');
        if (destroyed) return;

        const chars = await Promise.all(
          AGENT_CONFIGS.map((c) => FolkCharacter.create(c.folkId)),
        );
        if (destroyed) return;

        // 캐릭터/UI를 world 컨테이너 안에 배치 (카메라 이동 시 함께 움직임)
        const parentContainer = worldContainer ?? app.stage;

        // 보드 레이어 (캐릭터보다 아래)
        const boardLayer = new Container();
        parentContainer.addChild(boardLayer);

        const charLayer = new Container();
        parentContainer.addChild(charLayer);

        const uiLayer = new Container();
        parentContainer.addChild(uiLayer);

        // ── 에이전트 상태 초기화 ──
        const agentStates: AgentState[] = AGENT_CONFIGS.map((cfg, i) => {
          const char = chars[i];
          const center = scene.getCenter(cfg.roomKey);
          char.setPosition(center.x, center.y);
          charLayer.addChild(char.view);

          // 이름 태그 (흰색 배경 + 텍스트)
          const nameTag = new Container();
          const nameTextStyle = new TextStyle({
            fontSize: 10,
            fontFamily: 'sans-serif',
            fill: 0x333333,
            align: 'center',
            fontWeight: 'bold',
          });
          const nameText = new Text({ text: tr(cfg.nameKey), style: nameTextStyle });
          nameText.anchor.set(0.5, 0.5);
          const pad = 4;
          const nameBg = new Graphics();
          nameBg.roundRect(
            -nameText.width / 2 - pad,
            -nameText.height / 2 - pad / 2,
            nameText.width + pad * 2,
            nameText.height + pad,
            4,
          ).fill({ color: 0xffffff, alpha: 0.85 });
          nameTag.addChild(nameBg);
          nameTag.addChild(nameText);
          nameTag.position.set(center.x, center.y + char.pixelHeight / 2 + 6);
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
            idleTimer: randBetween(5, 12),
            bubbleAlpha: 0,
            bubbleShowTimer: 0,
            patrolTimer: randBetween(4, 10),
            questPhase: 'idle',
            questTimer: 0,
            questIdx: 0,
          };
        });

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

        // ── 퀘스트 보드 — ali 방 오른쪽 아래에 배치 (중앙 가림 방지) ──
        const aliCenter = scene.getCenter('ali');
        const aliBounds = scene.getRoomBounds('ali');
        const boardPx = { x: aliBounds.x + aliBounds.w - scene.tileSize * 2, y: aliCenter.y - scene.tileSize * 2 };
        const boardStats = { pending: [2, 1, 1], completed: 0 }; // 에이전트별 대기

        const board = new Container();
        board.position.set(boardPx.x, boardPx.y);

        // 픽셀아트 스타일 게시판 (나무 프레임 + 양피지 배경)
        const bw = 160, bh = 100;
        const boardBg = new Graphics();
        // 나무 기둥 2개
        boardBg.rect(-bw/2 + 8, -4, 6, bh + 12).fill(0x6b4226);
        boardBg.rect(bw/2 - 14, -4, 6, bh + 12).fill(0x6b4226);
        // 나무 프레임 (바깥)
        boardBg.rect(-bw/2, 0, bw, bh).fill(0x8B5E3C);
        // 양피지 (안쪽)
        boardBg.rect(-bw/2 + 4, 4, bw - 8, bh - 8).fill(0xF5E6C8);
        // 나무 프레임 상단 장식
        boardBg.rect(-bw/2 - 2, -2, bw + 4, 6).fill(0x6b4226);
        boardBg.rect(-bw/2 - 2, bh - 2, bw + 4, 6).fill(0x6b4226);
        // 못 장식 (4 corners)
        boardBg.circle(-bw/2 + 8, 6, 2).fill(0x888888);
        boardBg.circle(bw/2 - 8, 6, 2).fill(0x888888);
        boardBg.circle(-bw/2 + 8, bh - 6, 2).fill(0x888888);
        boardBg.circle(bw/2 - 8, bh - 6, 2).fill(0x888888);
        board.addChild(boardBg);

        const boardTitleStyle = new TextStyle({
          fontSize: 9, fontFamily: '"Press Start 2P", monospace', fill: 0x5a3010, fontWeight: 'bold', align: 'center',
        });
        const boardTitle = new Text({ text: '📋 QUEST BOARD', style: boardTitleStyle });
        boardTitle.anchor.set(0.5, 0); boardTitle.position.set(0, 10);
        board.addChild(boardTitle);

        const boardBodyStyle = new TextStyle({
          fontSize: 8, fontFamily: '"Press Start 2P", monospace', fill: 0x4a3520, lineHeight: 14, align: 'left',
        });
        const boardBody = new Text({ text: '', style: boardBodyStyle });
        boardBody.anchor.set(0.5, 0); boardBody.position.set(0, 26);
        board.addChild(boardBody);
        boardLayer.addChild(board);

        const updateBoard = () => {
          const lines = [
            `🔍 사진 분석 대기: ${boardStats.pending[0]}건`,
            `📣 SNS 홍보 대기: ${boardStats.pending[1]}건`,
            `📋 제보 안내 대기: ${boardStats.pending[2]}건`,
            ``,
            `✅ 오늘 완료: ${boardStats.completed}건`,
          ];
          boardBody.text = lines.join('\n');
        };
        updateBoard();

        // ── 더미 퀘스트 타이머 ──
        let dummyTimer = randBetween(3, 6); // 첫 퀘스트 빠르게

        // 이동 헬퍼
        const ARRIVE_DIST = 3;
        const moveToward = (state: AgentState, tx: number, ty: number, dt: number): boolean => {
          const dx = tx - state.x;
          const dy = ty - state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > ARRIVE_DIST) {
            const step = state.speed * dt;
            state.x += (dx / dist) * Math.min(step, dist);
            state.y += (dy / dist) * Math.min(step, dist);
            state.char.setPosition(state.x, state.y);
            state.char.setFlipX(dx < 0);
            state.char.play('run');
            return false;
          }
          state.char.play('idle');
          return true;
        };

        // ── Ticker 루프 ──
        app.ticker.add((ticker) => {
          const dt = ticker.deltaMS / 1000;

          // ── 더미 퀘스트 생성 ──
          dummyTimer -= dt;
          if (dummyTimer <= 0) {
            // 가장 한가한 에이전트에 퀘스트 할당
            const idle = agentStates.filter(s => s.questPhase === 'idle');
            if (idle.length > 0) {
              const s = idle[Math.floor(Math.random() * idle.length)];
              const i = agentStates.indexOf(s);
              s.questPhase = 'going_to_board';
              s.questIdx = Math.floor(Math.random() * 3);
              if (boardStats.pending[i] > 0) boardStats.pending[i]--;
              updateBoard();
            }
            dummyTimer = randBetween(8, 15);
          }

          // 실제 API 이벤트도 소비 (퀘스트로 변환, idle일 때만)
          if (pendingEventsRef.current.length > 0) {
            const evt = pendingEventsRef.current[0];
            const idx = evt.eventType === 'match_detected' ? 0
              : evt.eventType === 'outreach_sent' ? 1 : 2;
            const state = agentStates[idx];
            if (state && state.questPhase === 'idle') {
              pendingEventsRef.current.shift();
              state.questPhase = 'going_to_board';
              state.questIdx = Math.floor(Math.random() * 3);
            }
          }

          for (let i = 0; i < agentStates.length; i++) {
            const state = agentStates[i];
            const cfg = AGENT_CONFIGS[i];
            const quests = DUMMY_QUESTS[cfg.id] ?? DUMMY_QUESTS['chatbot-alert'];

            // 스프라이트 애니메이션 업데이트
            state.char.tick(dt);

            // ── 퀘스트 상태 머신 ──
            switch (state.questPhase) {
              case 'going_to_board': {
                if (moveToward(state, boardPx.x, boardPx.y + 40, dt)) {
                  state.questPhase = 'at_board';
                  state.questTimer = 1.5;
                  showBubble(state, '📋 퀘스트 확인 중...', 1.5);
                }
                break;
              }
              case 'at_board': {
                state.questTimer -= dt;
                if (state.questTimer <= 0) {
                  state.questPhase = 'going_to_work';
                  state.targetX = state.homeX + randBetween(-30, 30);
                  state.targetY = state.homeY + randBetween(-20, 20);
                  showBubble(state, '💪 수락!', 1);
                }
                break;
              }
              case 'going_to_work': {
                if (moveToward(state, state.targetX, state.targetY, dt)) {
                  state.questPhase = 'working';
                  state.questTimer = randBetween(3, 5);
                  state.workIcon.position.set(state.x, state.y - state.char.pixelHeight - 4);
                  state.workIcon.alpha = 1;
                  showBubble(state, quests[state.questIdx].working, 3);
                }
                break;
              }
              case 'working': {
                state.questTimer -= dt;
                state.workIcon.position.set(state.x, state.y - state.char.pixelHeight - 4 + Math.sin(Date.now() / 200) * 3);
                if (state.questTimer <= 0) {
                  state.questPhase = 'complete';
                  state.questTimer = 2;
                  state.workIcon.alpha = 0;
                  showBubble(state, quests[state.questIdx].done, 3);
                  boardStats.completed++;
                  boardStats.pending[i] = Math.max(0, boardStats.pending[i]) + Math.floor(Math.random() * 2); // 새 퀘스트 랜덤 추가
                  updateBoard();
                }
                break;
              }
              case 'complete': {
                state.questTimer -= dt;
                if (state.questTimer <= 0) {
                  state.questPhase = 'idle';
                  state.patrolTimer = randBetween(3, 8);
                }
                break;
              }
              default: {
                // ── idle: 유휴 패트롤 ──
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

                const dx = state.targetX - state.x;
                const dy = state.targetY - state.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > ARRIVE_DIST) {
                  const step = state.speed * dt;
                  state.x += (dx / dist) * Math.min(step, dist);
                  state.y += (dy / dist) * Math.min(step, dist);
                  state.char.setPosition(state.x, state.y);
                  state.char.setFlipX(dx < 0);
                  state.char.play('run');
                } else {
                  state.char.play('idle');
                }
                break;
              }
            }

            // ── 이름 태그 위치 동기화 ──
            state.nameTag.position.set(state.x, state.y + state.char.pixelHeight / 2 + 6);

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
        if (!destroyed) setPhase('ready');
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
