import { useTranslation } from 'react-i18next';
import { CharPortrait } from './GameBriefing';
import type { TargetInfo } from './gameLogic';

export interface GameHUDProps {
  timeRemaining: number;
  totalTime: number;
  found: number;
  total: number;
  score: number;
  targets: TargetInfo[];
  foundIds: Set<number>;
}

export default function GameHUD({ timeRemaining, totalTime, found, total, score, targets, foundIds }: GameHUDProps) {
  const { t } = useTranslation();

  const pct = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;
  const isLow = timeRemaining <= 5;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      {/* Timer bar */}
      <div className="h-1.5 w-full bg-black/30">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${isLow ? 'bg-red-500' : 'bg-green-400'}`}
          style={{ width: `${Math.max(0, pct)}%` }}
        />
      </div>

      {/* HUD strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/60 backdrop-blur-sm">
        {/* Found counter */}
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">🔍</span>
          <span className="text-white text-sm font-bold tabular-nums">
            {found}/{total}
          </span>
        </div>

        {/* Timer */}
        <div className={`text-sm font-bold tabular-nums ${isLow ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {timeRemaining}s
        </div>

        {/* Score */}
        <div className="flex items-center gap-1">
          <span className="text-amber-300 text-sm font-bold tabular-nums">
            {score.toLocaleString()}
          </span>
          <span className="text-gray-400 text-xs">{t('findGame.score')}</span>
        </div>
      </div>

      {/* Target portraits — who to find */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        {targets.map((target, idx) => (
          <div
            key={idx}
            className={`rounded-lg overflow-hidden border-2 p-0.5 transition-all ${
              foundIds.has(idx)
                ? 'border-green-400 bg-green-900/60 opacity-50'
                : 'border-amber-400/70 bg-black/50'
            }`}
          >
            <CharPortrait charId={target.charId} size={32} />
            {foundIds.has(idx) && (
              <div className="absolute inset-0 flex items-center justify-center text-green-300 text-lg">✓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
