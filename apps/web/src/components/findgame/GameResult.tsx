import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Play, Tv, ArrowLeft } from 'lucide-react';

export interface GameResultProps {
  score: number;
  found: number;
  total: number;
  timeRemaining: number;
  canPlayFree: boolean;
  canPlayAd: boolean;
  onPlayAgain: (usedAd: boolean) => void;
  onExit: () => void;
}

const COUNT_UP_DURATION_MS = 1200;
const COUNT_UP_FPS = 60;

export default function GameResult({
  score,
  found,
  total,
  timeRemaining,
  canPlayFree,
  canPlayAd,
  onPlayAgain,
  onExit,
}: GameResultProps) {
  const { t } = useTranslation();
  const [displayScore, setDisplayScore] = useState(0);
  const actionRef = useRef(false);

  // Count-up animation
  useEffect(() => {
    if (score === 0) {
      setDisplayScore(0);
      return;
    }
    const steps = Math.round((COUNT_UP_DURATION_MS / 1000) * COUNT_UP_FPS);
    const increment = score / steps;
    let current = 0;
    let frame = 0;

    const interval = setInterval(() => {
      frame += 1;
      current = Math.min(score, Math.round(increment * frame));
      setDisplayScore(current);
      if (current >= score) clearInterval(interval);
    }, 1000 / COUNT_UP_FPS);

    return () => clearInterval(interval);
  }, [score]);

  const timeBonus = timeRemaining > 0 ? Math.floor(timeRemaining * 50) : 0;
  const allFound = found === total;

  const handlePlayFree = () => {
    if (actionRef.current) return;
    actionRef.current = true;
    onPlayAgain(false);
  };

  const handlePlayAd = () => {
    if (actionRef.current) return;
    actionRef.current = true;
    onPlayAgain(true);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col items-center gap-4">

        {/* Trophy icon */}
        <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${allFound ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
          <Trophy className="w-7 h-7 text-white" />
        </div>

        {/* Title */}
        <h2 className="text-white text-lg font-bold">
          {allFound ? t('findGame.result.perfect') : t('findGame.result.title')}
        </h2>

        {/* Score */}
        <div className="text-center">
          <div className="text-4xl font-extrabold text-amber-300 tabular-nums">
            {displayScore.toLocaleString()}
          </div>
          <div className="text-gray-400 text-xs mt-1">{t('findGame.score')}</div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 bg-white/5 rounded-xl px-6 py-3 w-full justify-center">
          <div className="text-center">
            <div className="text-white font-bold text-lg tabular-nums">
              {found}/{total}
            </div>
            <div className="text-gray-400 text-xs">{t('findGame.result.foundLabel')}</div>
          </div>
          {timeBonus > 0 && (
            <>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <div className="text-green-400 font-bold text-lg tabular-nums">
                  +{timeBonus.toLocaleString()}
                </div>
                <div className="text-gray-400 text-xs">{t('findGame.result.timeBonus')}</div>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5 w-full">
          {canPlayFree && (
            <button
              onClick={handlePlayFree}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Play className="w-4 h-4" />
              {t('findGame.result.playAgain')}
            </button>
          )}

          {!canPlayFree && canPlayAd && (
            <button
              onClick={handlePlayAd}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Tv className="w-4 h-4" />
              {t('findGame.result.watchAdPlay')}
            </button>
          )}

          {!canPlayFree && !canPlayAd && (
            <div className="text-center text-gray-400 text-sm py-1">
              {t('findGame.result.noPlays')}
            </div>
          )}

          <button
            onClick={onExit}
            className="w-full border border-white/20 text-gray-300 font-medium py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-white/5 active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('findGame.result.exit')}
          </button>
        </div>

      </div>
    </div>
  );
}
