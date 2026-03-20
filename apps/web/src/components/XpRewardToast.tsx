import { createRoot, type Root } from 'react-dom/client';
import { Zap, X, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, forwardRef, useMemo, createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import {
  calculateXPAnimationSteps,
  animateValue,
  easings,
} from '../lib/xp-animation';

// ── 타입 ──

export interface XpToastPayload {
  xpGained: number;
  action: string;
  leveledUp?: boolean;
  newLevel?: number;
  reward?: { label: string };
  /** 현재 레벨 (애니메이션 시작점, 없으면 프로그레스 바 생략) */
  userLevel?: number;
  /** 현재 레벨 내 XP (애니메이션 시작점) */
  userCurrentXP?: number;
}

// ── Context (기존 인터페이스 유지) ──

interface XpToastContextValue {
  showXpToast: (payload: XpToastPayload) => void;
}

const XpToastContext = createContext<XpToastContextValue>({
  showXpToast: () => { /* noop */ },
});

export function useXpToast() {
  return useContext(XpToastContext);
}

// ── Global toast state (pryzm 패턴: React Portal + 글로벌 상태) ──

interface ToastItem {
  id: number;
  xp: number;
  description?: string;
  userLevel: number;
  userCurrentXP: number;
  onComplete?: () => void;
}

let toastId = 0;
const activeToasts: ToastItem[] = [];
let containerRoot: Root | null = null;
let container: HTMLDivElement | null = null;
const toastContainerId = 'xp-toast-container';
const MAX_TOASTS = 2;

// XP claim merging
let pendingXPClaims: { xp: number; description?: string }[] = [];
let mergeTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserLevel = 1;
let currentUserXP = 0;

function formatInt(n: number): string {
  return Math.floor(n).toLocaleString();
}

// ── Toast 렌더링 ──

function renderToasts() {
  if (container && !document.body.contains(container)) {
    containerRoot = null;
    container = null;
  }

  if (!container) {
    const existing = document.getElementById(toastContainerId) as HTMLDivElement | null;
    if (existing) {
      container = existing;
    } else {
      container = document.createElement('div');
      container.id = toastContainerId;
      document.body.appendChild(container);
    }
  }

  containerRoot ??= createRoot(container);

  containerRoot.render(
    <div
      className="fixed left-4 right-4 lg:left-auto lg:right-8 lg:bottom-8 mx-auto lg:mx-0 max-w-md z-[9999] flex flex-col-reverse gap-3"
      style={{ bottom: 'calc(4rem + 1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <AnimatePresence mode="popLayout">
        {activeToasts.map((toast) => (
          <ToastXPClaimAnimated
            key={toast.id}
            toast={toast}
            onRemove={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>,
  );
}

// ── Animated Toast Component ──

interface ToastXPClaimAnimatedProps {
  toast: ToastItem;
  onRemove: () => void;
}

const MAX_TOAST_DURATION_MS = 30_000;
const COMPRESS_THRESHOLD = 3;

const ToastXPClaimAnimated = forwardRef<HTMLDivElement, ToastXPClaimAnimatedProps>(
  function ToastXPClaimAnimated({ toast, onRemove }, ref) {
    const { t } = useTranslation();

    const [animationSteps] = useState(() =>
      calculateXPAnimationSteps(toast.userLevel, toast.userCurrentXP, toast.xp),
    );

    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [displayXP, setDisplayXP] = useState(toast.userCurrentXP);
    const [displayLevel, setDisplayLevel] = useState(toast.userLevel);
    const [isLevelingUp, setIsLevelingUp] = useState(false);

    const hasStartedRef = useRef(false);
    const cancelledRef = useRef(false);
    const isCancelled = () => cancelledRef.current;

    const currentStep = animationSteps[currentStepIndex]
      ?? animationSteps[0]
      ?? { type: 'xp-gain' as const, level: toast.userLevel, currentXP: 0, xpGain: 0, xpToNextLevel: 1 };
    const isLastStep = currentStepIndex === animationSteps.length - 1;
    const totalLevelUps = animationSteps.filter((s) => s.type === 'level-up').length;

    const finalLevel = useMemo(() => {
      const lastLevelUp = [...animationSteps].reverse().find((s) => s.type === 'level-up');
      return lastLevelUp?.newLevel ?? toast.userLevel;
    }, [animationSteps, toast.userLevel]);

    useEffect(() => {
      cancelledRef.current = false;
      return () => { cancelledRef.current = true; };
    }, []);

    useEffect(() => {
      const timeout = setTimeout(() => {
        if (!cancelledRef.current) onRemove();
      }, MAX_TOAST_DURATION_MS);
      return () => clearTimeout(timeout);
    }, [onRemove]);

    // Run animation
    useEffect(() => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      async function runAnimationSequence() {
        if (totalLevelUps >= COMPRESS_THRESHOLD) {
          await runCompressedAnimation();
        } else {
          await runNormalAnimation();
        }
        await new Promise((r) => setTimeout(r, 1500));
        if (isCancelled()) return;
        onRemove();
      }

      async function runCompressedAnimation() {
        if (isCancelled()) return;
        setCurrentStepIndex(0);
        setDisplayLevel(toast.userLevel);
        await animateValue(
          toast.userCurrentXP, currentStep.xpToNextLevel, 800,
          (v) => { if (!isCancelled()) setDisplayXP(Math.floor(v)); },
          easings.easeOut,
        );
        if (isCancelled()) return;

        setIsLevelingUp(true);
        await new Promise((r) => setTimeout(r, 400));
        if (isCancelled()) return;

        setDisplayLevel(finalLevel);
        setDisplayXP(0);
        await new Promise((r) => setTimeout(r, 1500));
        if (isCancelled()) return;
        setIsLevelingUp(false);

        const lastStep = animationSteps[animationSteps.length - 1];
        if (lastStep?.type === 'xp-gain') {
          setCurrentStepIndex(animationSteps.length - 1);
          await animateValue(
            0, lastStep.xpGain, 800,
            (v) => { if (!isCancelled()) setDisplayXP(Math.floor(v)); },
            easings.easeOut,
          );
        }
      }

      async function runNormalAnimation() {
        for (let i = 0; i < animationSteps.length; i++) {
          if (isCancelled()) return;
          const step = animationSteps[i];
          if (!step) continue;

          setCurrentStepIndex(i);
          setDisplayLevel(step.level);

          if (step.type === 'xp-gain') {
            await animateValue(
              step.currentXP, step.currentXP + step.xpGain, 1200,
              (v) => { if (!isCancelled()) setDisplayXP(Math.floor(v)); },
              easings.easeOut,
            );
            await new Promise((r) => setTimeout(r, 200));
            if (isCancelled()) return;
          } else {
            // level-up
            if (isCancelled()) return;
            setIsLevelingUp(true);
            await new Promise((r) => setTimeout(r, 400));
            if (isCancelled()) return;

            setDisplayLevel(step.newLevel ?? step.level + 1);
            setDisplayXP(0);
            await new Promise((r) => setTimeout(r, 1200));
            if (isCancelled()) return;
            setIsLevelingUp(false);
            await new Promise((r) => setTimeout(r, 200));
            if (isCancelled()) return;
          }
        }
      }

      void runAnimationSequence();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const safeXpToNext = Math.max(0, currentStep.xpToNextLevel);
    const safeDisplayXP = safeXpToNext > 0 ? Math.max(0, Math.min(displayXP, safeXpToNext)) : 0;
    const progress = safeXpToNext > 0 ? (safeDisplayXP / safeXpToNext) * 100 : 100;

    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, x: 300, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut', layout: { duration: 0.2 } }}
        className="relative"
      >
        <div
          className={`backdrop-blur-md rounded-xl shadow-2xl border p-4 transition-all duration-300 ${
            isLevelingUp
              ? 'border-fuchsia-400/50 shadow-fuchsia-500/30 scale-105'
              : 'bg-gradient-to-r from-yellow-500/95 to-orange-500/95 border-yellow-400/30 shadow-yellow-500/20'
          }`}
          style={isLevelingUp ? { background: 'linear-gradient(to right, #c026d3, #7c3aed, #0891b2)', opacity: 0.95 } : undefined}
        >
          <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start gap-3">
              <motion.div
                className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
                animate={isLevelingUp ? { rotate: 360, scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.6 }}
              >
                {isLevelingUp
                  ? <TrendingUp className="text-white" size={20} />
                  : <Zap className="text-white" size={20} fill="white" />}
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-white font-semibold">
                    {isLevelingUp ? (
                      totalLevelUps >= COMPRESS_THRESHOLD
                        ? <>{t('xp.levelUp', { level: `${toast.userLevel} → ${finalLevel}` })}</>
                        : <>{t('xp.levelUp', { level: displayLevel })}</>
                    ) : (
                      <>+{formatInt(toast.xp)} XP</>
                    )}
                  </span>
                </div>
                {toast.description && !isLevelingUp && (
                  <p className="text-white/90 text-sm line-clamp-1">{toast.description}</p>
                )}
              </div>

              <button
                onClick={onRemove}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                aria-label="Close"
              >
                <X className="text-white" size={16} />
              </button>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-white/90 text-xs">
                <span>Level {displayLevel}</span>
                <span>{formatInt(safeDisplayXP)} / {formatInt(safeXpToNext)} XP</span>
              </div>

              <div className="relative h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    isLevelingUp ? '' : 'bg-gradient-to-r from-white to-yellow-200'
                  }`}
                  style={isLevelingUp ? { background: 'linear-gradient(to right, #e879f9, #a78bfa, #22d3ee)' } : undefined}
                  initial={{ width: `${currentStep.xpToNextLevel > 0 ? (toast.userCurrentXP / currentStep.xpToNextLevel) * 100 : 100}%` }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
                {!isLevelingUp && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    style={{ width: '50%' }}
                  />
                )}
              </div>

              {totalLevelUps > 1 && (isLevelingUp || !isLastStep) && (
                <p className="text-white/80 text-xs text-center">
                  {totalLevelUps} Level Ups!
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

// ── Toast 관리 ──

function removeToast(id: number) {
  const index = activeToasts.findIndex((t) => t.id === id);
  if (index !== -1) {
    const toast = activeToasts[index];
    activeToasts.splice(index, 1);
    renderToasts();
    toast?.onComplete?.();
  }
}

/**
 * 글로벌 XP 토스트 표시 (React 외부에서도 호출 가능)
 * 200ms 내 연속 호출은 자동 머지
 */
export function showXPClaimToast(
  xp: number,
  description?: string,
  userLevel?: number,
  userCurrentXP?: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (userLevel !== undefined) currentUserLevel = userLevel;
    if (userCurrentXP !== undefined) currentUserXP = userCurrentXP;

    pendingXPClaims.push({ xp, description });
    if (mergeTimer) clearTimeout(mergeTimer);

    mergeTimer = setTimeout(() => {
      const totalXP = pendingXPClaims.reduce((sum, c) => sum + c.xp, 0);
      const descriptions = pendingXPClaims.map((c) => c.description).filter(Boolean).join(', ');

      toastId++;
      activeToasts.push({
        id: toastId,
        xp: totalXP,
        description: descriptions || undefined,
        userLevel: currentUserLevel,
        userCurrentXP: currentUserXP,
        onComplete: resolve,
      });

      if (activeToasts.length > MAX_TOASTS) {
        const removed = activeToasts.shift();
        removed?.onComplete?.();
      }

      renderToasts();
      pendingXPClaims = [];
      mergeTimer = null;
    }, 200);
  });
}

// ── Provider (기존 인터페이스 호환) ──

export function XpToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  const showXpToast = (payload: XpToastPayload) => {
    const description = t(`xp.${payload.action}`, { defaultValue: payload.action });
    void showXPClaimToast(
      payload.xpGained,
      description,
      payload.userLevel,
      payload.userCurrentXP,
    );
  };

  return (
    <XpToastContext.Provider value={{ showXpToast }}>
      {children}
    </XpToastContext.Provider>
  );
}
