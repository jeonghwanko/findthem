import { useTranslation } from 'react-i18next';

export interface GameHUDProps {
  timeRemaining: number;
  totalTime: number;
  found: number;
  total: number;
  score: number;
}

export default function GameHUD({ timeRemaining, totalTime, found, total, score }: GameHUDProps) {
  const { t } = useTranslation();

  const pct = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;
  const isLow = timeRemaining <= 5;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      {/* Timer bar */}
      <div className="h-2 w-full bg-black/30">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${isLow ? 'bg-red-500' : 'bg-green-400'}`}
          style={{ width: `${Math.max(0, pct)}%` }}
        />
      </div>

      {/* HUD strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/50 backdrop-blur-sm">
        {/* Found counter */}
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">🔍</span>
          <span className="text-white text-sm font-bold tabular-nums">
            {found}/{total}
          </span>
          <span className="text-gray-300 text-xs">{t('findGame.found')}</span>
        </div>

        {/* Timer */}
        <div className={`text-sm font-bold tabular-nums ${isLow ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {timeRemaining}s
        </div>

        {/* Score */}
        <div className="flex items-center gap-1">
          <span className="text-gray-300 text-xs">{t('findGame.score')}</span>
          <span className="text-amber-300 text-sm font-bold tabular-nums">
            {score.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
