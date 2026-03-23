import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';

interface CharPortraitProps {
  charId: number;
  size?: number;
}

export function CharPortrait({ charId, size = 64 }: CharPortraitProps) {
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

export default function GameBriefing({ targets, roundNumber, onReady }: GameBriefingProps) {
  const { t } = useTranslation();

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
              <div className="rounded-xl overflow-hidden border-2 border-amber-400/60 bg-white/10 p-1.5 shadow-lg shadow-amber-400/20">
                <CharPortrait charId={charId} size={64} />
              </div>
            </div>
          ))}
        </div>

        <p className="text-white/60 text-sm text-center">{t('findGame.briefingHint')}</p>

        {/* Start button */}
        <button
          type="button"
          onClick={onReady}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg px-10 py-4 rounded-2xl shadow-lg shadow-green-500/30 hover:opacity-90 active:scale-95 transition-all"
        >
          <Play className="w-6 h-6" />
          {t('findGame.start')}
        </button>
      </div>
    </div>
  );
}
