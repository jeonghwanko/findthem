import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';
import { api } from '../api/client';
import { useRewardAd } from '../hooks/useRewardAd';
import { MAX_BOOSTS_PER_DAY, TOKEN_STORAGE_KEY } from '@findthem/shared';

interface BoostButtonProps {
  reportId: string;
}

interface BoostStatus {
  boostsUsedToday: number;
  maxBoosts: number;
}

export default function BoostButton({ reportId }: BoostButtonProps) {
  const { t } = useTranslation();
  const { showRewardAd, loading: adLoading, isNative } = useRewardAd();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [authorized, setAuthorized] = useState(true);
  const [boosting, setBoosting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const isBoostingRef = useRef(false);

  useEffect(() => {
    if (!isNative || !localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    api.get<BoostStatus>(`/reports/${reportId}/boost-status`)
      .then(setStatus)
      .catch(() => setAuthorized(false));
  }, [reportId, isNative]);

  if (!isNative || !localStorage.getItem(TOKEN_STORAGE_KEY) || !authorized) return null;

  const remaining = status ? status.maxBoosts - status.boostsUsedToday : MAX_BOOSTS_PER_DAY;
  const limitReached = status ? status.boostsUsedToday >= status.maxBoosts : false;

  const handleBoost = async () => {
    if (isBoostingRef.current || limitReached || boosting || adLoading) return;
    isBoostingRef.current = true;

    const rewarded = await showRewardAd();
    if (!rewarded) {
      isBoostingRef.current = false;
      return;
    }

    setBoosting(true);
    setMessage(null);
    try {
      const result = await api.post<{ ok: boolean; boostsRemaining: number }>(`/reports/${reportId}/boost`);
      setStatus((prev) => prev ? { ...prev, boostsUsedToday: prev.maxBoosts - result.boostsRemaining } : prev);
      setMessage({ type: 'success', text: t('boost.success') });
    } catch (err) {
      const is429 = (err as { status?: number }).status === 429;
      setMessage({ type: 'error', text: is429 ? t('boost.limitReached') : t('boost.error') });
    } finally {
      setBoosting(false);
      isBoostingRef.current = false;
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-amber-600" />
          <span className="font-semibold text-amber-800">{t('boost.title')}</span>
        </div>
        <span className="text-sm text-amber-600">
          {t('boost.remaining', { remaining, max: MAX_BOOSTS_PER_DAY })}
        </span>
      </div>
      <button
        onClick={handleBoost}
        disabled={limitReached || boosting || adLoading}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors ${
          limitReached
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-amber-500 hover:bg-amber-600 text-white'
        }`}
      >
        {boosting || adLoading ? t('boost.loading') : limitReached ? t('boost.limitReached') : t('boost.watchAd')}
      </button>
      {message && (
        <p className={`text-sm mt-2 ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
