import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  GAME_TYPES,
  FIND_GAME_FREE_PLAYS_PER_DAY,
  FIND_GAME_AD_PLAYS_PER_DAY,
  FIND_GAME_ROUND_SECS,
  TOKEN_STORAGE_KEY,
} from '@findthem/shared';
import { getGameStatus, recordGamePlay } from '../../api/game';
import { useRewardAd } from '../../hooks/useRewardAd';
import {
  generateRound,
  calculateScore,
  type RoundConfig,
} from './gameLogic';
import FindThemGameCanvas from './FindThemGameCanvas';
import GameHUD from './GameHUD';
import GameBriefing from './GameBriefing';
import GameResult from './GameResult';

// ── Local play record (guest users) ──
const LOCAL_PLAYS_KEY = 'ft_find_game_plays';

interface LocalPlayRecord {
  date: string; // YYYY-MM-DD UTC
  free: number;
  ad: number;
}

function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getLocalPlays(): LocalPlayRecord {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalPlayRecord;
      if (parsed.date === todayUTC()) return parsed;
    }
  } catch {
    // ignore
  }
  return { date: todayUTC(), free: 0, ad: 0 };
}

function setLocalPlays(rec: LocalPlayRecord): void {
  localStorage.setItem(LOCAL_PLAYS_KEY, JSON.stringify(rec));
}

function isLoggedIn(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return false;
  }
}

// ── Round constants ──
const MAP_COLS = 140;
const MAP_ROWS = 100;
const ROUND_TIME_SECS = FIND_GAME_ROUND_SECS;

export interface FindThemGameProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'loading' | 'briefing' | 'playing' | 'result';

interface GameState {
  round: RoundConfig;
  foundIds: Set<number>;
  score: number;
  timeRemaining: number;
  usedAd: boolean;
}

export default function FindThemGame({ open, onClose }: FindThemGameProps) {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>('loading');
  const [roundNumber, setRoundNumber] = useState(1);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [remainingFree, setRemainingFree] = useState(FIND_GAME_FREE_PLAYS_PER_DAY);
  const [remainingAd, setRemainingAd] = useState(FIND_GAME_AD_PLAYS_PER_DAY);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionRef = useRef(false);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const roundNumberRef = useRef(roundNumber);
  roundNumberRef.current = roundNumber;

  const { showRewardAd, isNative } = useRewardAd();

  // Restore body overflow on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Lock/unlock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [open]);

  // Refresh play counts
  const refreshCounts = useCallback(async () => {
    if (isLoggedIn()) {
      try {
        const status = await getGameStatus(GAME_TYPES.FIND);
        setRemainingFree(status.remainingFree);
        setRemainingAd(status.remainingAd);
      } catch {
        // silent — fall through to defaults
      }
    } else {
      const rec = getLocalPlays();
      setRemainingFree(Math.max(0, FIND_GAME_FREE_PLAYS_PER_DAY - rec.free));
      setRemainingAd(Math.max(0, FIND_GAME_AD_PLAYS_PER_DAY - rec.ad));
    }
  }, []);

  // Start a new round
  const startRound = useCallback(
    (rn: number, usedAd: boolean) => {
      if (timerRef.current) clearInterval(timerRef.current);

      const round = generateRound(rn, MAP_COLS, MAP_ROWS);
      setGameState({
        round,
        foundIds: new Set(),
        score: 0,
        timeRemaining: ROUND_TIME_SECS,
        usedAd,
      });
      setPhase('briefing');
    },
    [],
  );

  // Initialise when opened
  useEffect(() => {
    if (!open) return;
    void (async () => {
      setPhase('loading');
      await refreshCounts();
      startRound(1, false);
      setRoundNumber(1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tick timer while playing
  useEffect(() => {
    if (phase !== 'playing') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setGameState((prev) => {
        if (!prev) return prev;
        const next = prev.timeRemaining - 1;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          // Transition to result on next tick to avoid setState-during-render
          setTimeout(() => setPhase('result'), 0);
          return { ...prev, timeRemaining: 0 };
        }
        return { ...prev, timeRemaining: next };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Briefing countdown complete → start playing
  const handleBriefingReady = useCallback(() => {
    setPhase('playing');
  }, []);

  // Target found
  const handleTargetFound = useCallback((instanceId: number) => {
    setGameState((prev) => {
      if (!prev || prev.foundIds.has(instanceId)) return prev;
      const foundIds = new Set(prev.foundIds);
      foundIds.add(instanceId);

      const newScore = calculateScore(foundIds.size, prev.round.targets.length, prev.timeRemaining);

      // All found → end round
      if (foundIds.size >= prev.round.targets.length) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setTimeout(() => setPhase('result'), 400);
      }

      return { ...prev, foundIds, score: newScore };
    });
  }, []);

  // Record play to server or localStorage
  const recordPlay = useCallback(async (state: GameState) => {
    if (isLoggedIn()) {
      try {
        await recordGamePlay(
          'chatbot-alert',
          state.score,
          state.usedAd,
          GAME_TYPES.FIND,
        );
      } catch {
        // silent
      }
    } else {
      const rec = getLocalPlays();
      if (state.usedAd) rec.ad += 1;
      else rec.free += 1;
      setLocalPlays(rec);
    }
    await refreshCounts();
  }, [refreshCounts]);

  // Play again handler
  const handlePlayAgain = useCallback(async (usedAd: boolean) => {
    if (actionRef.current) return;
    actionRef.current = true;

    try {
      if (usedAd) {
        if (isNative) {
          const watched = await showRewardAd();
          if (!watched) return;
        }
        // Web: allow without real ad (dev / test)
      }

      // Record the previous round first
      const prevState = gameStateRef.current;
      if (prevState) await recordPlay(prevState);

      const nextRound = roundNumberRef.current + 1;
      setRoundNumber(nextRound);
      startRound(nextRound, usedAd);
    } finally {
      actionRef.current = false;
    }
  }, [isNative, showRewardAd, recordPlay, startRound]);

  // Exit handler
  const handleExit = useCallback(async () => {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      const prevState = gameStateRef.current;
      if (prevState && phase === 'result') {
        await recordPlay(prevState);
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase('loading');
      onClose();
    } finally {
      actionRef.current = false;
    }
  }, [phase, recordPlay, onClose]);

  if (!open) return null;

  const canPlayFree = remainingFree > 0;
  const canPlayAd = remainingAd > 0;

  const content = (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {phase === 'loading' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white text-sm animate-pulse">{t('loading')}</div>
        </div>
      )}

      {gameState && phase !== 'loading' && (
        <div className="relative w-full h-full overflow-hidden">

          {/* Game canvas — always mounted once gameState exists, fills entire overlay */}
          <div className="absolute inset-0">
            <FindThemGameCanvas
              round={gameState.round}
              foundIds={gameState.foundIds}
              timeRemaining={gameState.timeRemaining}
              onTargetFound={handleTargetFound}
            />
          </div>

          {/* HUD — only during play */}
          {phase === 'playing' && (
            <GameHUD
              timeRemaining={gameState.timeRemaining}
              totalTime={ROUND_TIME_SECS}
              found={gameState.foundIds.size}
              total={gameState.round.targets.length}
              score={gameState.score}
            />
          )}

          {/* Briefing overlay */}
          {phase === 'briefing' && (
            <GameBriefing
              targets={gameState.round.targets}
              roundNumber={roundNumber}
              onReady={handleBriefingReady}
            />
          )}

          {/* Result overlay */}
          {phase === 'result' && (
            <GameResult
              score={gameState.score}
              found={gameState.foundIds.size}
              total={gameState.round.targets.length}
              timeRemaining={gameState.timeRemaining}
              canPlayFree={canPlayFree}
              canPlayAd={canPlayAd}
              onPlayAgain={handlePlayAgain}
              onExit={handleExit}
            />
          )}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
