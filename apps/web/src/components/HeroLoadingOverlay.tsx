import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  progress: number; // 0 – TOTAL_STEPS
  total: number;    // 5
  visible: boolean; // false → fade-out
}

const AGENTS = [
  {
    nameKey: 'home.heroAgent.detective.name',
    msgs: [
      'home.heroLoading.detective.msg1', 'home.heroLoading.detective.msg2',
      'home.heroLoading.detective.msg3', 'home.heroLoading.detective.msg4', 'home.heroLoading.detective.msg5',
    ] as const,
    head: '#818cf8', // indigo-400
    text: '#a5b4fc', // indigo-300
    badge: '🔍',
  },
  {
    nameKey: 'home.heroAgent.promo.name',
    msgs: [
      'home.heroLoading.promo.msg1', 'home.heroLoading.promo.msg2',
      'home.heroLoading.promo.msg3', 'home.heroLoading.promo.msg4', 'home.heroLoading.promo.msg5',
    ] as const,
    head: '#f472b6', // pink-400
    text: '#f9a8d4', // pink-300
    badge: '📢',
  },
  {
    nameKey: 'home.heroAgent.guide.name',
    msgs: [
      'home.heroLoading.guide.msg1', 'home.heroLoading.guide.msg2',
      'home.heroLoading.guide.msg3', 'home.heroLoading.guide.msg4', 'home.heroLoading.guide.msg5',
    ] as const,
    head: '#4ade80', // green-400
    text: '#86efac', // green-300
    badge: '💬',
  },
] as const;

// 15 messages total (3 agents × 5 each)
const ALL_MSGS = AGENTS.flatMap((a, agentIdx) =>
  a.msgs.map((msgKey) => ({ nameKey: a.nameKey, msgKey, color: a.text, agentIdx })),
);

/** Pick a random index different from the current one. */
function pickRandom(current: number): number {
  if (ALL_MSGS.length <= 1) return 0;
  let next: number;
  do { next = Math.floor(Math.random() * ALL_MSGS.length); } while (next === current);
  return next;
}

// ── Expression animation ──────────────────────────────────────────────────────

type Expression = { l: string; r: string; mouth: string };

/** Per-agent expression frames. Each agent has its own personality. */
const AGENT_EXPRESSIONS: Expression[][] = [
  // 탐정 클로드 — 분석가: 천천히, 꼼꼼하게
  [
    { l: '●', r: '●', mouth: '⌣' },   // 평상시 스캔 중
    { l: '—', r: '—', mouth: '⌣' },   // 눈 가늘게 뜨고 분석
    { l: '✦', r: '✦', mouth: '∪' },   // 매칭 발견! (반짝반짝)
    { l: '●', r: '—', mouth: '⌣' },   // 윙크 (자신감)
  ],
  // 홍보왕 헤르미 — 에너지 넘침: 빠르게 변함
  [
    { l: '●', r: '●', mouth: '⌣' },   // 준비 완료
    { l: '◉', r: '◉', mouth: '▽' },   // 흥분! 텐션 MAX
    { l: '♡', r: '♡', mouth: '‿' },   // 하트 눈 (반해버림)
    { l: '●', r: '—', mouth: '‿' },   // 윙크 (매력 발산)
  ],
  // 안내봇 알리 — 친근함: 부드럽게
  [
    { l: '●', r: '●', mouth: '⌣' },   // 친근한 대기
    { l: '^', r: '^', mouth: 'ω' },    // 귀여운 표정
    { l: '◡', r: '◡', mouth: '‿' },   // 포근한 미소
    { l: '—', r: '●', mouth: '⌣' },   // 수줍은 윙크
  ],
];

/** 캐릭터별 표정 전환 간격 (ms) — 성격 반영 */
const AGENT_INTERVALS = [1900, 850, 1350] as const;

const EYE_STYLE: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  fontWeight: 900,
  fontSize: 13,
  color: '#1e1b4b',
  lineHeight: 1,
  userSelect: 'none',
};

/** 독립적인 표정 애니메이션을 가진 얼굴 컴포넌트 */
function AnimatedFace({ agentIdx, color, loaded, badge }: {
  agentIdx: number;
  color: string;
  loaded: boolean;
  badge: string;
}) {
  const expressions = AGENT_EXPRESSIONS[agentIdx];
  // 세 캐릭터가 동기화되지 않도록 시작 프레임을 엇갈림
  const [exprIdx, setExprIdx] = useState(agentIdx % expressions.length);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const ms = AGENT_INTERVALS[agentIdx];
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setExprIdx((i) => (i + 1) % expressions.length);
        setFading(false);
      }, 120);
    }, ms);
    return () => clearInterval(id);
  }, [agentIdx, expressions.length]);

  const expr = expressions[exprIdx];
  const faceSt: React.CSSProperties = {
    opacity: fading ? 0 : 1,
    transition: 'opacity 0.12s ease',
  };

  return (
    <div
      className={loaded ? '' : 'animate-pulse'}
      style={{
        position: 'relative',
        width: 64,
        height: 64,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: loaded ? `0 0 20px ${color}99` : 'none',
        transition: 'box-shadow 0.5s ease',
        flexShrink: 0,
      }}
    >
      {/* 눈 */}
      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, ...faceSt }}>
        <span style={EYE_STYLE}>{expr.l}</span>
        <span style={EYE_STYLE}>{expr.r}</span>
      </div>
      {/* 입 */}
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', ...faceSt }}>
        <span style={{ ...EYE_STYLE, fontSize: 12 }}>{expr.mouth}</span>
      </div>
      {/* 역할 뱃지 */}
      <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 15, lineHeight: 1 }}>
        {badge}
      </span>
    </div>
  );
}

// ── Opacity helper ────────────────────────────────────────────────────────────

function charOpacity(idx: number, progress: number): number {
  if (progress >= 5) return 1;
  if (progress >= 4) return 0.8;
  if (progress >= idx + 1) return 0.6;
  return 0.18;
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export function HeroLoadingOverlay({ progress, total, visible }: Props) {
  const { t } = useTranslation();
  const [msgIdx, setMsgIdx] = useState(() => Math.floor(Math.random() * ALL_MSGS.length));
  const [msgOpacity, setMsgOpacity] = useState(1);
  const [cursorOn, setCursorOn] = useState(true);

  // Random message switch every 1.6 s — fade out → swap → fade in
  useEffect(() => {
    const id = setInterval(() => {
      setMsgOpacity(0);
      setTimeout(() => {
        setMsgIdx((i) => pickRandom(i));
        setMsgOpacity(1);
      }, 250);
    }, 1600);
    return () => clearInterval(id);
  }, []);

  // Blinking text cursor
  useEffect(() => {
    const id = setInterval(() => setCursorOn((c) => !c), 480);
    return () => clearInterval(id);
  }, []);

  const current = ALL_MSGS[msgIdx];

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none select-none"
      style={{ backgroundColor: '#1e1b4b', opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}
    >
      {/* Animated character faces */}
      <div className="flex gap-10 mb-7">
        {AGENTS.map((agent, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-2"
            style={{ opacity: charOpacity(i, progress), transition: 'opacity 0.6s ease' }}
          >
            <AnimatedFace
              agentIdx={i}
              color={agent.head}
              loaded={progress >= i + 1}
              badge={agent.badge}
            />
            <span className="text-[10px] font-semibold" style={{ color: agent.text }}>
              {t(agent.nameKey)}
            </span>
          </div>
        ))}
      </div>

      {/* Typing message */}
      <p
        className="text-sm font-medium mb-5 h-5"
        style={{ color: current.color, opacity: msgOpacity, transition: 'opacity 0.25s ease, color 0.25s ease' }}
      >
        {t(current.msgKey)}
        <span style={{ opacity: cursorOn ? 1 : 0 }}>▎</span>
      </p>

      {/* 5-dot step indicator */}
      <div className="flex gap-2.5 items-center">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i < progress ? 10 : 8,
              height: i < progress ? 10 : 8,
              borderRadius: '50%',
              backgroundColor: i < progress ? '#818cf8' : 'rgba(255,255,255,0.15)',
              boxShadow: i < progress ? '0 0 6px #818cf8aa' : 'none',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
