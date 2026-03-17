import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, X, Trophy, Play, Tv } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRewardAd } from '../hooks/useRewardAd';
import { getGameStatus, recordGamePlay, type GameStatus } from '../api/game';
import { SpinePortrait } from '../components/SpinePortrait';
import { MAX_FREE_PLAYS_PER_DAY, MAX_AD_PLAYS_PER_DAY } from '@findthem/shared';

// ── 스토리지 키 (비로그인 로컬 한도 관리) ──
const LOCAL_PLAYS_KEY = 'ft_game_plays';

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

function setLocalPlays(rec: LocalPlayRecord) {
  localStorage.setItem(LOCAL_PLAYS_KEY, JSON.stringify(rec));
}

// ── 캐릭터 정의 ──
const MAX_FREE = MAX_FREE_PLAYS_PER_DAY;
const MAX_AD = MAX_AD_PLAYS_PER_DAY;

const CHARACTERS = [
  {
    id: 'image-matching' as const,
    nameKey: 'game.characters.claude.name',
    descKey: 'game.characters.claude.desc',
    skins: ['body_090', 'cos_090', 'hair_090', 'hat_090', 'weapon_090'] as const,
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    ring: 'ring-purple-400',
    portraitBorder: '#818cf8',
  },
  {
    id: 'chatbot-alert' as const,
    nameKey: 'game.characters.ali.name',
    descKey: 'game.characters.ali.desc',
    skins: ['body_043', 'cos_042', 'hair_000', 'hat_042', 'weapon_042'] as const,
    bg: 'bg-sky-50',
    border: 'border-sky-300',
    ring: 'ring-sky-400',
    portraitBorder: '#38bdf8',
  },
  {
    id: 'promotion' as const,
    nameKey: 'game.characters.heimi.name',
    descKey: 'game.characters.heimi.desc',
    skins: ['body_102', 'cos_102', 'hair_102', 'hat_102', 'weapon_102'] as const,
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    ring: 'ring-rose-400',
    portraitBorder: '#f472b6',
  },
] as const;

type CharacterId = (typeof CHARACTERS)[number]['id'];

type Phase = 'select' | 'playing' | 'result';

const GAME_URL = '/stair/index.html';

export default function GamePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showRewardAd, loading: adLoading, isNative } = useRewardAd();

  const [phase, setPhase] = useState<Phase>('select');
  const [selected, setSelected] = useState<CharacterId | null>(null);
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [localPlays, setLocalPlaysState] = useState<LocalPlayRecord>(getLocalPlays);
  const [resultScore, setResultScore] = useState<number>(0);
  const [adGranted, setAdGranted] = useState(false);
  const [saving, setSaving] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isSubmittingRef = useRef(false);
  const isWatchingAdRef = useRef(false);
  // ref로 최신 상태 추적 (stale closure 방지)
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const adGrantedRef = useRef(adGranted);
  adGrantedRef.current = adGranted;

  // 오늘 플레이 현황 로드
  const refreshStatus = useCallback(async () => {
    if (user) {
      try { setStatus(await getGameStatus()); } catch { /* silent */ }
    }
  }, [user]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const remainingFree = user
    ? (status?.remainingFree ?? MAX_FREE)
    : Math.max(0, MAX_FREE - localPlays.free);

  const remainingAd = user
    ? (status?.remainingAd ?? MAX_AD)
    : Math.max(0, MAX_AD - localPlays.ad);

  const canPlay = remainingFree > 0 || (adGranted && remainingAd > 0);

  // 점수 기록 (ref를 통해 최신 상태 사용)
  const savePlay = useCallback(async (score: number) => {
    const char = selectedRef.current;
    if (!char) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSaving(true);
    try {
      const usedAd = adGrantedRef.current && remainingFree <= 0;
      if (user) {
        await recordGamePlay(char, score, usedAd);
        await refreshStatus();
      } else {
        const rec = getLocalPlays();
        if (usedAd) rec.ad += 1;
        else rec.free += 1;
        setLocalPlays(rec);
        setLocalPlaysState({ ...rec });
      }
      setAdGranted(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
      isSubmittingRef.current = false;
    }
  }, [user, remainingFree, refreshStatus]);

  // iframe → game score 수신
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // origin 검증: 동일 origin (로컬 서빙)이거나 postMessage from iframe
      if (e.origin !== window.location.origin && e.origin !== 'null') return;
      if (typeof e.data !== 'object' || !e.data) return;
      if (e.data.type === 'GAME_OVER' && typeof e.data.score === 'number') {
        setResultScore(e.data.score);
        setPhase('result');
        void savePlay(e.data.score);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [savePlay]);

  const handleStartGame = () => {
    if (!selected || !canPlay) return;
    setPhase('playing');
  };

  const handleWatchAd = async () => {
    if (adLoading || isWatchingAdRef.current) return;
    isWatchingAdRef.current = true;
    try {
      if (!isNative) {
        // 웹: 광고 없이 바로 허용 (개발/테스트)
        setAdGranted(true);
        return;
      }
      const rewarded = await showRewardAd();
      if (rewarded) setAdGranted(true);
    } finally {
      isWatchingAdRef.current = false;
    }
  };

  const handlePlayAgain = () => {
    setResultScore(0);
    setPhase('select');
    setSelected(null);
  };

  const handleExitGame = () => {
    // 게임 중 나가기 → 점수 0으로 1판 소진 처리
    void savePlay(0);
    setPhase('select');
  };

  // ── 선택 화면 ──
  if (phase === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('game.title')}</h1>
        </div>
        <p className="text-gray-500 text-sm mb-1 text-center">{t('game.subtitle')}</p>

        {/* 오늘 플레이 현황 */}
        <div className="flex items-center gap-4 my-4 bg-white border border-gray-200 rounded-xl px-6 py-3 shadow-sm">
          <div className="text-center">
            <div className="text-lg font-bold text-indigo-600">{remainingFree}</div>
            <div className="text-xs text-gray-500">{t('game.remainingFree')}</div>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="text-center">
            <div className="text-lg font-bold text-rose-500">{remainingAd}</div>
            <div className="text-xs text-gray-500">{t('game.remainingAd')}</div>
          </div>
        </div>

        {/* 캐릭터 선택 */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-lg mb-6">
          {CHARACTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setSelected(ch.id)}
              className={[
                'relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all',
                ch.bg,
                ch.border,
                selected === ch.id
                  ? `ring-2 ring-offset-2 ${ch.ring} scale-105 shadow-lg`
                  : 'hover:scale-102 hover:shadow-md opacity-80 hover:opacity-100',
              ].join(' ')}
            >
              <div
                className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                style={{ border: `2px solid ${ch.portraitBorder}` }}
              >
                <SpinePortrait skins={ch.skins} animate={false} />
              </div>
              <span className="text-xs font-bold text-gray-800 text-center leading-tight">
                {t(ch.nameKey)}
              </span>
              <span className="text-[10px] text-gray-500 text-center leading-tight">
                {t(ch.descKey)}
              </span>
              {selected === ch.id && (
                <div className="absolute -top-2 -right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 시작 / 광고 버튼 */}
        {canPlay ? (
          <button
            onClick={handleStartGame}
            disabled={!selected}
            className="w-full max-w-xs bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5" />
            {adGranted ? t('game.startWithAd') : t('game.start')}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <div className="text-sm text-gray-500 text-center">{t('game.limitReached')}</div>
            {remainingAd > 0 && (
              <button
                onClick={handleWatchAd}
                disabled={adLoading}
                className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition disabled:opacity-60"
              >
                <Tv className="w-5 h-5" />
                {adLoading ? t('game.adLoading') : t('game.watchAd')}
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
        >
          <X className="w-4 h-4" /> {t('game.back')}
        </button>
      </div>
    );
  }

  // ── 게임 중 ──
  if (phase === 'playing') {
    const ch = CHARACTERS.find((c) => c.id === selected);
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-black/80 backdrop-blur-sm">
          <span className="text-white text-sm font-semibold">
            {ch ? t(ch.nameKey) : ''}
          </span>
          <button
            onClick={handleExitGame}
            className="text-gray-400 hover:text-white transition p-1"
            aria-label={t('game.back')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <iframe
          ref={iframeRef}
          src={GAME_URL}
          className="flex-1 w-full border-none"
          allow="autoplay"
          title={t('game.title')}
        />
      </div>
    );
  }

  // ── 결과 화면 ──
  const resultChar = CHARACTERS.find((c) => c.id === selected);
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('game.result.title')}</h2>
        <p className="text-4xl font-extrabold text-indigo-600 my-4">
          {resultScore.toLocaleString()}
        </p>
        {resultChar && (
          <div className="flex flex-col items-center mb-6">
            <p className="text-sm text-gray-400 mb-2">{t('game.result.character')}</p>
            <div
              className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center mb-2"
              style={{ border: `2px solid ${resultChar.portraitBorder}` }}
            >
              <SpinePortrait skins={resultChar.skins} animate={false} />
            </div>
            <p className="text-base font-semibold text-gray-700">
              {t(resultChar.nameKey)}
            </p>
          </div>
        )}

        {saving && <p className="text-xs text-gray-400 mb-4">{t('game.result.saving')}</p>}

        {(remainingFree > 0 || remainingAd > 0) ? (
          <button
            onClick={handlePlayAgain}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition mb-3"
          >
            <Play className="w-4 h-4" /> {t('game.result.playAgain')}
          </button>
        ) : (
          <div className="text-sm text-gray-500 mb-3">{t('game.result.noPlays')}</div>
        )}

        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-400 hover:text-gray-600 transition"
        >
          {t('game.result.goHome')}
        </button>
      </div>
    </div>
  );
}
