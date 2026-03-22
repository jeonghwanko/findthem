import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import type { AgentActivityAgent, AgentActivity, AgentActivityEvent } from '@findthem/shared';
import { useAgentActivity } from '../hooks/useAgentActivity';
import { computeLayout, drawScene, roomCenter, tileToPixel, type RoomLayout, drawTiledScene, tiledRoomCenter, centerTiledCamera, setupTiledDrag, type TiledSceneLayout } from '@findthem/pixi-scenes/game';
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

// ── NPC 마을 주민 (배경 캐릭터, 랜덤 패트롤만) ──
const NPC_CONFIGS = [
  { folkId: 2, offsetX: -120, offsetY: -80 },
  { folkId: 4, offsetX: 100, offsetY: -60 },
  { folkId: 5, offsetX: -80, offsetY: 90 },
  { folkId: 7, offsetX: 60, offsetY: 70 },
  { folkId: 8, offsetX: -40, offsetY: -30 },
];

const SCENE_H = 480;

// ── 레이아웃 어댑터 (TileMap / Graphics fallback 통합) ──
interface SceneLayout {
  getCenter(roomKey: 'claude' | 'heimi' | 'ali'): { x: number; y: number };
  getRoomBounds(roomKey: 'claude' | 'heimi' | 'ali'): { x: number; y: number; w: number; h: number };
  /** 뷰포트에 보이는 월드 영역 (카메라 위치 기반) */
  getVisibleBounds(): { x: number; y: number; w: number; h: number };
  tileSize: number;
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
    getVisibleBounds: () => ({ x: 0, y: 0, w: l.sceneW, h: l.sceneH }),
    tileSize: s,
  };
}

function tiledLayout(l: TiledSceneLayout): SceneLayout {
  const td = l.tileDim;
  return {
    getCenter: (k) => tiledRoomCenter(k, l),
    getRoomBounds: (k) => {
      const r = l.rooms[k];
      if (!r) return { x: 0, y: 0, w: td * 10, h: td * 10 };
      return { x: r.x * td, y: r.y * td, w: r.w * td, h: r.h * td };
    },
    getVisibleBounds: () => ({
      x: -l.world.x,
      y: -l.world.y,
      w: l.viewportW,
      h: l.viewportH,
    }),
    tileSize: td,
  };
}

// ── 퀘스트 페이즈 ──
type QuestPhase = 'idle' | 'going_to_board' | 'at_board' | 'going_to_work' | 'working' | 'complete';

// ── 퀘스트 말풍선 텍스트 (시각 연출용) ──
const QUEST_BUBBLES: Record<string, { working: string; done: string }[]> = {
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
  questIdx: number; // QUEST_BUBBLES 인덱스
  // 활동 피드 (API recentActivities → HTML 말풍선 순차 표시)
  activityQueue: AgentActivity[];
  activityShowTimer: number;
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
  const agentsRef = useRef<AgentActivityAgent[]>([]);
  agentsRef.current = agents;

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
    const activeIntervals: ReturnType<typeof setInterval>[] = [];
    type HtmlBubbleEntry = { el: HTMLDivElement; intervalId: ReturnType<typeof setInterval> };
    const htmlBubbleMap = new Map<number, HtmlBubbleEntry>();

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
          preferWebGLVersion: 2,
          autoStart: false,
        });

        if (destroyed) return;

        // ── 배경 (타일맵 우선, 실패 시 Graphics fallback) ──
        const roomLayer = new Container();
        app.stage.addChild(roomLayer);

        let scene: SceneLayout;
        let worldContainer: Container | null = null;
        try {

          const tl = await drawTiledScene(roomLayer, W, H);
          scene = tiledLayout(tl);
          worldContainer = tl.world;
          const heimiCenter = tiledRoomCenter('heimi', tl);
          centerTiledCamera(heimiCenter.x, heimiCenter.y, tl);
          setupTiledDrag(tl.world, tl, app.stage);

        } catch (tileErr) {

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


        const [chars, npcChars] = await Promise.all([
          Promise.all(AGENT_CONFIGS.map((c) => FolkCharacter.create(c.folkId))),
          Promise.all(NPC_CONFIGS.map((n) => FolkCharacter.create(n.folkId))),
        ]);

        if (destroyed) return;

        // 캐릭터/UI를 world 컨테이너 안에 배치 (카메라 이동 시 함께 움직임)
        const parentContainer = worldContainer ?? app.stage;

        // (보드 제거됨)

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
            fontSize: 13,
            fontFamily: '"Pretendard", "Apple SD Gothic Neo", sans-serif',
            fill: 0x1a1a1a,
            fontWeight: '600',
            wordWrap: true,
            wordWrapWidth: 180,
            align: 'center',
            lineHeight: 18,
          });
          const bubbleText = new Text({ text: '', style: bubbleTextStyle });
          bubbleText.anchor.set(0.5, 0.5);
          bubble.addChild(bubbleBg);
          bubble.addChild(bubbleText);
          bubble.position.set(center.x, center.y - char.pixelHeight - 30);
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
            activityQueue: [],
            activityShowTimer: randBetween(2, 5),
          };
        });

        // ── NPC 마을 주민 초기화 ──
        interface NpcState {
          char: Awaited<ReturnType<typeof FolkCharacter.create>>;
          x: number; y: number;
          targetX: number; targetY: number;
          homeX: number; homeY: number;
          patrolTimer: number;
          speed: number;
        }
        const mapCenter = scene.getCenter('claude');
        const npcStates: NpcState[] = NPC_CONFIGS.map((cfg, i) => {
          const char = npcChars[i];
          const x = mapCenter.x + cfg.offsetX;
          const y = mapCenter.y + cfg.offsetY;
          char.setPosition(x, y);
          char.play('idle');
          charLayer.addChild(char.view);
          return {
            char, x, y, targetX: x, targetY: y, homeX: x, homeY: y,
            patrolTimer: randBetween(3, 8),
            speed: 20 + Math.random() * 15,
          };
        });

        // 말풍선 배경 갱신
        const refreshBubbleBg = (state: AgentState) => {
          const bg = state.bubbleBg;
          bg.clear();
          const pw = 20, ph = 14;
          const tw = state.bubbleText.width + pw * 2;
          const th = state.bubbleText.height + ph * 2;
          // 그림자
          bg.roundRect(-tw / 2 + 2, -th / 2 + 2, tw, th, 10).fill({ color: 0x000000, alpha: 0.1 });
          // 배경
          bg.roundRect(-tw / 2, -th / 2, tw, th, 10).fill({ color: 0xffffff, alpha: 0.95 });
          bg.roundRect(-tw / 2, -th / 2, tw, th, 10).stroke({ color: 0xd4c5a9, width: 1.5 });
          // 말풍선 꼬리 (아래쪽 삼각형)
          bg.moveTo(-6, th / 2).lineTo(0, th / 2 + 8).lineTo(6, th / 2).fill({ color: 0xffffff, alpha: 0.95 });
        };

        // 말풍선 표시
        const showBubble = (state: AgentState, text: string, duration = 3) => {
          state.bubbleText.text = text;
          refreshBubbleBg(state);
          state.bubbleShowTimer = duration;
          state.bubbleAlpha = 1;
        };

        // ── HTML 오버레이 말풍선 (썸네일 + 링크) ──
        const removeHtmlBubble = (agentIdx: number) => {
          const entry = htmlBubbleMap.get(agentIdx);
          if (!entry) return;
          clearInterval(entry.intervalId);
          entry.el.remove();
          htmlBubbleMap.delete(agentIdx);
          const arrIdx = activeIntervals.indexOf(entry.intervalId);
          if (arrIdx >= 0) activeIntervals.splice(arrIdx, 1);
        };

        const showHtmlBubble = (agentIdx: number, item: AgentActivity, duration: number) => {
          // 해당 에이전트의 기존 버블만 제거
          removeHtmlBubble(agentIdx);

          const el = document.createElement('div');
          el.className = 'agent-html-bubble';
          el.style.cssText = `
            position:absolute; z-index:20; pointer-events:auto;
            background:#fff; border:1.5px solid #d4c5a9; border-radius:12px;
            box-shadow:0 4px 16px rgba(0,0,0,0.12);
            padding:8px; max-width:220px; cursor:${item.url ? 'pointer' : 'default'};
            opacity:0; transition:opacity 0.3s ease;
            display:flex; gap:8px; align-items:center;
          `;

          // 썸네일
          if (item.thumbnailUrl) {
            const img = document.createElement('img');
            img.src = item.thumbnailUrl;
            img.style.cssText = 'width:56px;height:42px;object-fit:cover;border-radius:6px;flex-shrink:0;';
            img.onerror = () => { img.style.display = 'none'; };
            el.appendChild(img);
          }

          // 텍스트
          const textDiv = document.createElement('div');
          textDiv.style.cssText = 'font-size:12px;font-weight:600;color:#1a1a1a;line-height:1.4;font-family:Pretendard,sans-serif;';
          textDiv.textContent = item.description;
          el.appendChild(textDiv);

          // 링크 아이콘
          if (item.url) {
            const link = document.createElement('div');
            link.style.cssText = 'font-size:14px;flex-shrink:0;';
            link.textContent = '↗';
            el.appendChild(link);
            el.addEventListener('click', () => window.open(item.url, '_blank', 'noopener,noreferrer'));
          }

          // 꼬리
          const tail = document.createElement('div');
          tail.style.cssText = `
            position:absolute; bottom:-7px; left:50%; transform:translateX(-50%);
            width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent;
            border-top:7px solid #fff; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.08));
          `;
          el.appendChild(tail);

          container.appendChild(el);

          // 위치 갱신 함수
          const updatePos = () => {
            if (destroyed) return;
            const st = agentStates[agentIdx];
            if (!st) return;
            const wx = worldContainer ? (st.x + worldContainer.x) : st.x;
            const wy = worldContainer ? ((st.y - st.char.pixelHeight - 50) + worldContainer.y) : (st.y - st.char.pixelHeight - 50);
            el.style.left = `${wx - el.offsetWidth / 2}px`;
            el.style.top = `${wy - el.offsetHeight}px`;
          };
          // 레이아웃 후 위치 설정 + 페이드인
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (destroyed) return;
            updatePos();
            el.style.opacity = '1';
          }));
          const posInterval = setInterval(updatePos, 50);
          activeIntervals.push(posInterval);
          htmlBubbleMap.set(agentIdx, { el, intervalId: posInterval });

          // 자동 제거
          setTimeout(() => {
            if (destroyed) return;
            el.style.opacity = '0';
            setTimeout(() => removeHtmlBubble(agentIdx), 300);
          }, duration * 1000);
        };

        // ── 큐 기반 퀘스트 트리거 ──
        let boardCheckTimer = randBetween(5, 10);

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

          // ── 보드 갱신 + 활동 피드 동기화 + 퀘스트 트리거 ──
          boardCheckTimer -= dt;
          if (boardCheckTimer <= 0) {
            const cur = agentsRef.current;

            // 활동 피드 동기화: recentActivities → activityQueue
            for (let ai = 0; ai < agentStates.length; ai++) {
              const agent = cur.find((a) => a.agentId === AGENT_CONFIGS[ai].id);
              if (!agent) continue;
              const existingDescs = new Set(agentStates[ai].activityQueue.map((a) => a.description));
              const newItems = agent.recentActivities.filter((a) => !existingDescs.has(a.description));
              if (newItems.length > 0) {
                agentStates[ai].activityQueue.push(...newItems);
                if (agentStates[ai].activityQueue.length > 15) {
                  agentStates[ai].activityQueue = agentStates[ai].activityQueue.slice(-15);
                }
              }
            }

            // 큐에 대기 작업이 있고 idle인 에이전트에 퀘스트 트리거
            let bestIdx = -1;
            let bestPending = 0;
            for (let ai = 0; ai < agentStates.length; ai++) {
              if (agentStates[ai].questPhase !== 'idle') continue;
              const pending = cur.find((a) => a.agentId === AGENT_CONFIGS[ai].id)?.queuePending ?? 0;
              if (pending > bestPending) {
                bestPending = pending;
                bestIdx = ai;
              }
            }
            if (bestIdx >= 0) {
              agentStates[bestIdx].questPhase = 'going_to_board';
              agentStates[bestIdx].questIdx = Math.floor(Math.random() * 3);
            }
            boardCheckTimer = randBetween(15, 25);
          }

          // 실제 API 이벤트 소비 (퀘스트로 변환, idle일 때만)
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
            const quests = QUEST_BUBBLES[cfg.id] ?? QUEST_BUBBLES['chatbot-alert'];

            // 스프라이트 애니메이션 업데이트
            state.char.tick(dt);

            // ── 퀘스트 상태 머신 ──
            switch (state.questPhase) {
              case 'going_to_board': {
                // 보드 제거됨 — 즉시 작업 시작
                state.questPhase = 'at_board';
                state.questTimer = 1.5;
                showBubble(state, '📋 퀘스트 확인 중...', 1.5);
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
                  // 활동 큐에서 실제 설명 사용, 없으면 폴백
                  const workItem = state.activityQueue.shift();
                  const workMsg = workItem?.description ?? quests[state.questIdx].working;
                  showBubble(state, workMsg, 3);
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
                  const doneItem = state.activityQueue.shift();
                  const doneMsg = doneItem?.description ?? quests[state.questIdx].done;
                  showBubble(state, doneMsg, 3);
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
                // ── idle: 유휴 패트롤 (뷰포트 내로 제한) ──
                state.patrolTimer -= dt;
                if (state.patrolTimer <= 0) {
                  const vis = scene.getVisibleBounds();
                  const pad = scene.tileSize * 2;
                  // 캐릭터 home 근처 ±80px, 뷰포트 안으로 클램핑
                  state.targetX = clamp(
                    state.homeX + randBetween(-80, 80),
                    vis.x + pad,
                    vis.x + vis.w - pad,
                  );
                  state.targetY = clamp(
                    state.homeY + randBetween(-60, 60),
                    vis.y + pad,
                    vis.y + vis.h - pad,
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
                  // ── idle 중 활동 피드 표시 ──
                  if (state.bubbleShowTimer <= 0) {
                    // 큐 비면 API recentActivities에서 리필 (중복 방지)
                    if (state.activityQueue.length === 0) {
                      const agent = agentsRef.current.find((a) => a.agentId === cfg.id);
                      const items = agent?.recentActivities ?? [];
                      if (items.length > 0) {
                        const existing = new Set(state.activityQueue.map((a) => a.description));
                        const fresh = items.filter((a) => !existing.has(a.description));
                        state.activityQueue.push(...(fresh.length > 0 ? fresh : items));
                      }
                    }
                    state.activityShowTimer -= dt;
                    if (state.activityShowTimer <= 0 && state.activityQueue.length > 0) {
                      const item = state.activityQueue.shift()!;
                      if (item.thumbnailUrl || item.url) {
                        // HTML 오버레이 말풍선 (썸네일 + 링크)
                        showHtmlBubble(i, item, 6);
                        state.bubbleShowTimer = 6; // Pixi bubble 숨김 유지
                      } else {
                        showBubble(state, item.description, 4);
                      }
                      state.activityShowTimer = randBetween(5, 8);
                    }
                  }
                }
                break;
              }
            }

            // ── 이름 태그 위치 동기화 ──
            state.nameTag.position.set(state.x, state.y + state.char.pixelHeight / 2 + 6);

            // ── 말풍선 페이드 ──
            if (state.bubbleShowTimer > 0) {
              state.bubbleShowTimer -= dt;
              state.bubble.position.set(state.x, state.y - state.char.pixelHeight - 35);
              state.bubble.alpha = Math.min(state.bubbleAlpha, state.bubbleShowTimer > 0.3 ? 1 : state.bubbleShowTimer / 0.3);
            } else {
              state.bubble.alpha = 0;
            }
          }
        });

        // ── NPC 패트롤 ticker ──
        app.ticker.add((ticker) => {
          if (destroyed) return;
          const dt = ticker.deltaMS / 1000;
          for (const npc of npcStates) {
            npc.char.tick(dt);
            npc.patrolTimer -= dt;
            if (npc.patrolTimer <= 0) {
              npc.targetX = npc.homeX + (Math.random() - 0.5) * 160;
              npc.targetY = npc.homeY + (Math.random() - 0.5) * 120;
              npc.patrolTimer = randBetween(5, 15);
            }
            const dx = npc.targetX - npc.x;
            const dy = npc.targetY - npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 2) {
              const step = Math.min(npc.speed * dt, dist);
              npc.x += (dx / dist) * step;
              npc.y += (dy / dist) * step;
              npc.char.setPosition(npc.x, npc.y);
              if (Math.abs(dx) > Math.abs(dy)) {
                npc.char.setFlipX(dx < 0);
              }
              npc.char.play('run');
            } else {
              npc.char.play('idle');
            }
          }
        });

        app.ticker.start();
        if (!destroyed) setPhase('ready');
      } catch (err: unknown) {
        const e = err as Error;
        console.error('[AgentScene] Fatal error:', e?.message ?? String(err), e?.stack ?? '');
        // ticker를 시작하지 않으면 캔버스가 검은 박스로 남음
        try { if (!app.ticker.started) app.ticker.start(); } catch { /* ignore */ }
        if (!destroyed) setPhase('ready');
      }
    })();

    return () => {
      destroyed = true;
      // HTML 오버레이 + interval 정리
      activeIntervals.forEach(clearInterval);
      activeIntervals.length = 0;
      htmlBubbleMap.forEach((entry) => { clearInterval(entry.intervalId); entry.el.remove(); });
      htmlBubbleMap.clear();
      container.querySelectorAll('.agent-html-bubble').forEach((el) => el.remove());
      app.destroy(true, { children: true });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingEventsRef는 stable ref
  }, [visible]);

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
