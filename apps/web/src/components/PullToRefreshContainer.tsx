import { useRef, useState, useEffect, type ReactNode } from 'react';
import { usePullToRefreshContext } from '../context/PullToRefreshContext';

const THRESHOLD = 64;        // 새로고침 트리거 임계값 (px)
const MAX_PULL = 140;        // 최대 시각적 당김 거리 (px)
const SCROLL_THRESHOLD = 2;  // 최상단 판별 여유값 (px)
const HEADER_HEIGHT = 56;    // 헤더 높이 (sticky, Tailwind h-14)

// 비선형 당김: 처음엔 가볍고 많이 당길수록 무거워짐 (고무줄 느낌)
function rubberBand(delta: number): number {
  const d = Math.max(0, delta);
  return MAX_PULL * (1 - Math.exp(-d / 320));
}

type Phase = 'idle' | 'pulling' | 'loading';

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function PullToRefreshContainer({ children, className, style }: Props) {
  const { invoke, hasListener } = usePullToRefreshContext();

  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  // 이벤트 핸들러에서 stale closure 없이 최신값을 동기로 읽기 위한 refs
  const pullYRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const invokeRef = useRef(invoke);
  invokeRef.current = invoke;

  const setPull = (y: number) => { pullYRef.current = y; setPullY(y); };
  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!activeRef.current || phaseRef.current === 'loading') return;

      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        deactivate();
        if (phaseRef.current === 'pulling') { setPhaseSync('idle'); setPull(0); }
        return;
      }

      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (scrollTop <= SCROLL_THRESHOLD && e.cancelable) e.preventDefault();

      setPull(rubberBand(delta));
      setPhaseSync('pulling');
    };

    // non-passive touchmove를 당김 시작 시점에만 동적 등록 → 일반 스크롤 중 jank 없음
    const activate = () => document.addEventListener('touchmove', onMove, { passive: false });
    const deactivate = () => {
      activeRef.current = false;
      document.removeEventListener('touchmove', onMove);
    };

    const onStart = (e: TouchEvent) => {
      if (!hasListener()) return; // 콜백 미등록 페이지(/, /team 등) 자동 제외
      if (phaseRef.current !== 'idle') return;
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (scrollTop > SCROLL_THRESHOLD) return;

      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
      activate();
    };

    const onEnd = async () => {
      if (!activeRef.current) return;
      deactivate();
      if (phaseRef.current !== 'pulling') return;

      if (pullYRef.current >= THRESHOLD) {
        setPhaseSync('loading');
        setPull(0);
        try { await invokeRef.current(); } catch { /* 실패해도 UI는 복구 */ }
        if (mountedRef.current) setPhaseSync('idle');
      } else {
        setPull(0);
        setPhaseSync('idle');
      }
    };

    // touchcancel: 전화 수신 등 OS 인터럽트로 터치가 취소될 때 상태 초기화
    const onCancel = () => {
      if (!activeRef.current) return;
      deactivate();
      setPull(0);
      setPhaseSync('idle');
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = phase === 'loading';
  const progress = Math.min(pullY / THRESHOLD, 1);

  return (
    <div className={className} style={style}>
      {/* PTR 인디케이터 — 헤더 바로 아래, 당기기 전엔 투명/위로 숨김 */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 right-0 flex justify-center z-30"
        style={{
          top: HEADER_HEIGHT,
          transform: `translateY(${isLoading ? 0 : pullY * 0.5 - 40}px)`,
          transition: phase === 'idle' ? 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease' : 'none',
          opacity: isLoading ? 1 : progress,
        }}
      >
        <div
          className="w-9 h-9 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center"
          style={{
            transform: `scale(${0.6 + progress * 0.4})`,
            transition: phase === 'idle' ? 'transform 0.25s ease' : 'none',
          }}
        >
          {isLoading ? (
            <svg className="w-5 h-5 text-indigo-500 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="14 42" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-indigo-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)`, transition: 'transform 0.2s ease' }}
            >
              <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {/* 컨텐츠 래퍼 — 당기면 아래로 이동, 스냅백 시 spring 애니메이션 */}
      <div
        style={{
          transform: `translateY(${isLoading ? 0 : pullY}px)`,
          transition: phase === 'idle' ? 'transform 0.6s cubic-bezier(0.34, 1.4, 0.64, 1)' : 'none',
          // willChange 항상 유지 → 스냅백 애니메이션 시작 직전 GPU 레이어 해제 방지
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
