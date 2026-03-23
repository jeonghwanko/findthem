import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface CharPortraitProps {
  charId: number;
  size?: number;
}

function CharPortrait({ charId, size = 64 }: CharPortraitProps) {
  const col = ((charId - 1) % 4);
  const row = Math.floor((charId - 1) / 4);
  const bgX = col * 96;
  const bgY = row * 128;
  const scale = size / 32;

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundImage: 'url(/tiles/32x32folk.png)',
        backgroundPosition: `-${bgX * scale}px -${bgY * scale}px`,
        backgroundSize: `${384 * scale}px ${256 * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

export interface GameBriefingProps {
  targets: Array<{ charId: number }>;
  roundNumber: number;
  onReady: () => void;
}

const COUNTDOWN_START = 3;

export default function GameBriefing({ targets, roundNumber, onReady }: GameBriefingProps) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(COUNTDOWN_START);

  useEffect(() => {
    if (countdown <= 0) {
      onReady();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onReady]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 px-6 py-8 max-w-sm w-full">
        {/* Round label */}
        <div className="bg-white/10 border border-white/20 rounded-full px-5 py-1.5">
          <span className="text-white text-sm font-bold tracking-wide">
            {t('findGame.round', { n: roundNumber })}
          </span>
        </div>

        {/* Instruction */}
        <h2 className="text-white text-lg font-bold text-center">
          {t('findGame.briefingTitle')}
        </h2>

        {/* Character portraits */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {targets.map(({ charId }, idx) => (
            <div
              key={`${charId}-${idx}`}
              className="flex flex-col items-center gap-2"
            >
              <div className="rounded-xl overflow-hidden border-2 border-white/30 bg-white/10 p-1">
                <CharPortrait charId={charId} size={64} />
              </div>
              <span className="text-white/70 text-xs">
                #{charId}
              </span>
            </div>
          ))}
        </div>

        {/* Countdown circle */}
        <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center">
          <span className="text-white text-4xl font-extrabold tabular-nums">
            {countdown}
          </span>
        </div>

        <p className="text-white/50 text-xs">{t('findGame.briefingHint')}</p>
      </div>
    </div>
  );
}
