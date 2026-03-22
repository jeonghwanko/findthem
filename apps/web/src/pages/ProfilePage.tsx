import { useState, useRef, useEffect, useCallback } from 'react';
import {
  User as UserIcon,
  Mail,
  Calendar,
  Shield,
  Save,
  Camera,
  Star,
  Gift,
  Users,
  Bell,
  BellOff,
  TicketCheck,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePushNotification } from '../hooks/usePushNotification';
import { api, type User } from '../api/client';
import { MAX_FILE_SIZE } from '@findthem/shared';
import type { XpStats, XpGrantResult } from '@findthem/shared';
import XpHistoryModal from '../components/XpHistoryModal';
import { useXpToast } from '../components/XpRewardToast';
import MobileQuickLinks from '../components/MobileQuickLinks';
import { getWebOrigin } from '../utils/webOrigin';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

interface ProfilePageProps {
  user: User;
  onUserUpdate: (user: User) => void;
}

export default function ProfilePage({ user, onUserUpdate }: ProfilePageProps) {
  const { t } = useTranslation();
  const { subscribed, loading: pushLoading, isSupported, subscribe, unsubscribe } = usePushNotification();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; messageKey: string } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [xpStats, setXpStats] = useState<XpStats | null>(null);
  const [xpHistoryOpen, setXpHistoryOpen] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const { showXpToast } = useXpToast();
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSharingRef = useRef(false);
  const [referralInput, setReferralInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [referralApplied, setReferralApplied] = useState(user.hasReferrer ?? false);
  const [referralError, setReferralError] = useState<string | null>(null);

  function showFeedback(type: 'success' | 'error', messageKey: string) {
    setFeedback({ type, messageKey });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000);
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const fetchXpStats = useCallback(async () => {
    const data = await api.get<XpStats>('/users/me/xp-stats').catch(() => null);
    if (data) setXpStats(data);
  }, []);

  usePullToRefresh(fetchXpStats);

  useEffect(() => {
    void fetchXpStats();

    if (!user.referralCode) {
      void api.post<{ referralCode: string }>('/auth/me/referral-code')
        .then((data) => onUserUpdate({ ...user, referralCode: data.referralCode }))
        .catch(() => {/* 무시 */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = user.name?.charAt(0)?.toUpperCase() || '?';
  const hasChanges = name !== user.name || (email || null) !== (user.email || null);

  const providerLabel = (() => {
    const key = `profile.provider_${(user.provider ?? 'LOCAL').toLowerCase()}`;
    const fallback = (user.provider ?? 'LOCAL');
    return t(key, { defaultValue: fallback });
  })();

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {};
      if (name !== user.name) body.name = name;
      if (email !== (user.email ?? '')) body.email = email || null;
      const updated = await api.patch<User>('/auth/me', body);
      onUserUpdate(updated);
      setName(updated.name);
      setEmail(updated.email ?? '');
      showFeedback('success', 'profile.saved');
    } catch {
      showFeedback('error', 'profile.saveFailed');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyReferral() {
    if (!user.referralCode) return;
    try {
      await navigator.clipboard.writeText(user.referralCode);
    } catch {
      window.prompt(t('profile.referralCode'), user.referralCode);
    }
    setReferralCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setReferralCopied(false), 2000);
  }

  async function claimShareReward() {
    try {
      const result = await api.post<XpGrantResult>('/users/me/share-reward');
      showXpToast({
        xpGained: result.xpGained,
        action: 'SHARE',
        leveledUp: result.leveledUp,
        newLevel: result.newLevel,
        reward: result.reward,
        userLevel: xpStats?.level,
        userCurrentXP: xpStats?.currentXP,
      });
      if (result.leveledUp) {
        setXpStats((prev) =>
          prev ? { ...prev, xp: result.newXp, level: result.newLevel } : prev,
        );
      }
    } catch {/* 무시 */}
  }

  async function handleReferralShare() {
    if (isSharingRef.current || !user.referralCode) return;
    isSharingRef.current = true;
    try {
      const referralUrl = `${getWebOrigin()}/invite?ref=${user.referralCode}`;
      const shareTitle = t('profile.referralShareTitle');
      const shareDesc = t('profile.referralShareDesc');

      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareDesc, url: referralUrl });
          await claimShareReward();
        } catch { /* 사용자 취소 */ }
        return;
      }

      const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
      if (kakaoKey) {
        try {
          if (!window.Kakao) {
            await new Promise<void>((resolve, reject) => {
              const s = document.createElement('script');
              s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
              s.onload = () => resolve();
              s.onerror = () => reject(new Error('Kakao SDK load failed'));
              document.head.appendChild(s);
            });
          }
          if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(kakaoKey);
          window.Kakao?.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: shareTitle,
              description: shareDesc,
              imageUrl: `${getWebOrigin()}/pwa-512x512.png`,
              link: { mobileWebUrl: referralUrl, webUrl: referralUrl },
            },
            buttons: [{ title: t('profile.referralJoin'), link: { mobileWebUrl: referralUrl, webUrl: referralUrl } }],
          });
          await claimShareReward();
          return;
        } catch {
          // Kakao SDK 실패 → 클립보드 fallback
        }
      }

      try {
        await navigator.clipboard.writeText(referralUrl);
      } catch {
        window.prompt(t('profile.referralCode'), referralUrl);
      }
      await claimShareReward();
    } finally {
      isSharingRef.current = false;
    }
  }

  async function handleApplyReferral() {
    const code = referralInput.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code) || applyingReferral) return;
    if (user.referralCode && code === user.referralCode) {
      setReferralError(t('errors.SELF_REFERRAL', { defaultValue: t('invite.applyAlready') }));
      return;
    }
    setApplyingReferral(true);
    setReferralError(null);
    try {
      const result = await api.post<{ applied: boolean }>('/auth/me/apply-referral', { referralCode: code });
      if (result.applied) {
        setReferralApplied(true);
        showFeedback('success', 'invite.applySuccess');
      } else {
        setReferralError(t('invite.applyAlready'));
      }
    } catch (err: unknown) {
      const errCode = err instanceof Error ? err.message : '';
      setReferralError(t(`errors.${errCode}`, { defaultValue: t('invite.applyAlready') }));
    } finally {
      setApplyingReferral(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showFeedback('error', 'profile.errorImageOnly');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showFeedback('error', 'profile.errorFileTooLarge');
      return;
    }
    setUploading(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const updated = await api.post<User>('/auth/me/photo', form);
      onUserUpdate(updated);
      showFeedback('success', 'profile.photoSaved');
    } catch {
      showFeedback('error', 'profile.photoFailed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const xpPercent = xpStats && xpStats.xpRequiredForLevel > 0
    ? Math.min(100, Math.round((xpStats.currentXP / xpStats.xpRequiredForLevel) * 100))
    : 100;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-28">

      {/* ── 헤더 히어로 영역 ── */}
      <div className="relative bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl px-5 pt-6 pb-5 mb-4 overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-white/5 rounded-full" />

        <div className="relative flex items-center gap-4">
          {/* 프로필 이미지 */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative flex-shrink-0 w-20 h-20 rounded-full overflow-hidden border-2 border-white/60 ring-2 ring-white/30 cursor-pointer disabled:cursor-wait shadow-lg"
          >
            {user.profileImage ? (
              <img
                src={user.profileImage.replace(/^http:\/\//, 'https://')}
                alt={user.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-indigo-300 text-white flex items-center justify-center text-2xl font-bold">
                {initial}
              </div>
            )}
            {!uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => void handlePhotoUpload(e)}
            className="hidden"
          />

          {/* 이름 + 레벨 */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-lg leading-tight truncate">{user.name}</p>
            {xpStats && (
              <p className="text-indigo-200 text-xs mt-0.5">
                {t('profile.sponsorLevel', { level: xpStats.level })}
              </p>
            )}
            <p className="text-indigo-200/70 text-xs mt-0.5">{providerLabel}</p>
          </div>
        </div>

        {/* XP 진행 바 */}
        {xpStats && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-indigo-100 text-xs font-medium flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-300 text-yellow-300" />
                {xpStats.xpToNextLevel === 0
                  ? t('profile.xpMaxLevel')
                  : t('profile.xpProgress', {
                      current: xpStats.currentXP.toLocaleString(),
                      total: xpStats.xpRequiredForLevel.toLocaleString(),
                    })}
              </span>
              <button
                type="button"
                onClick={() => setXpHistoryOpen(true)}
                className="text-indigo-200 text-xs hover:text-white transition-colors flex items-center gap-0.5"
              >
                {t('xp.history')}
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-300 to-amber-300 rounded-full transition-all duration-700"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 인라인 피드백 토스트 ── */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-sm font-medium transition-all ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-100 text-green-700'
              : 'bg-red-50 border border-red-100 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="w-4 h-4 flex-shrink-0" />
          ) : (
            <span className="text-base leading-none flex-shrink-0">!</span>
          )}
          {t(feedback.messageKey)}
        </div>
      )}

      {/* ── 섹션 1: 내 정보 편집 ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('profile.sectionInfo')}
          </h2>
        </div>

        <div className="px-4 pb-2 space-y-4">
          {/* 이름 */}
          <div className="pt-2">
            <label htmlFor="profile-name" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
              <UserIcon className="w-3.5 h-3.5" />
              {t('profile.name')}
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow"
            />
          </div>

          {/* 이메일 */}
          <div>
            <label htmlFor="profile-email" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
              <Mail className="w-3.5 h-3.5" />
              {t('profile.email')}
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('profile.emailPlaceholder')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow"
            />
          </div>
        </div>

        {/* 저장 버튼 — 섹션 내 하단 */}
        <div className="px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges || !name.trim()}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              hasChanges && name.trim()
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            } disabled:opacity-60`}
          >
            <Save className="w-4 h-4" />
            {saving ? t('profile.saving') : t('profile.save')}
          </button>
        </div>
      </section>

      {/* ── 섹션 2: 계정 정보 (읽기 전용) ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('profile.sectionAccount')}
          </h2>
        </div>

        <div className="divide-y divide-gray-50">
          {/* 로그인 방식 */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 flex-1">{t('profile.provider')}</span>
            <span className="text-sm text-gray-700 font-medium">{providerLabel}</span>
          </div>

          {/* 가입일 */}
          {user.createdAt && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-500 flex-1">{t('profile.joinDate')}</span>
              <span className="text-sm text-gray-700 font-medium">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* 알림 설정 */}
          {isSupported && (
            <div className="flex items-center gap-3 px-4 py-3">
              {subscribed
                ? <Bell className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                : <BellOff className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <span className="text-sm text-gray-700 flex-1">{t('profile.pushNotification')}</span>
              <button
                type="button"
                onClick={() => { void (subscribed ? unsubscribe() : subscribe()); }}
                disabled={pushLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  subscribed ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
                role="switch"
                aria-checked={subscribed}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    subscribed ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── 섹션 3: 친구 초대 ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('profile.sectionReferral')}
          </h2>
        </div>

        <div className="px-4 pb-4 pt-3 space-y-3">
          {/* 추천 코드 입력 (추천인 없는 경우) */}
          {!referralApplied && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-1">
                <TicketCheck className="w-3.5 h-3.5" />
                {t('invite.applyTitle')}
              </div>
              <p className="text-xs text-indigo-500 mb-2.5">{t('invite.applyDesc')}</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referralInput}
                  onChange={(e) => {
                    setReferralInput(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8));
                    setReferralError(null);
                  }}
                  placeholder={t('invite.applyPlaceholder')}
                  maxLength={8}
                  className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg text-sm font-mono tracking-widest bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  type="button"
                  onClick={() => void handleApplyReferral()}
                  disabled={applyingReferral || referralInput.length !== 8}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {applyingReferral ? '...' : t('invite.applySubmit')}
                </button>
              </div>
              {referralError && (
                <p className="text-xs text-red-500 mt-1.5">{referralError}</p>
              )}
            </div>
          )}

          {/* 내 추천 코드 */}
          {user.referralCode && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" />
                {t('profile.referralCode')}
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono tracking-widest text-gray-700 text-center">
                  {user.referralCode}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyReferral()}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    referralCopied
                      ? 'bg-green-500 text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {referralCopied ? t('profile.referralCopied') : t('profile.referralCopy')}
                </button>
              </div>
            </div>
          )}

          {/* 친구 초대 버튼 */}
          {user.referralCode && (
            <button
              type="button"
              onClick={() => void handleReferralShare()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <Users className="w-4 h-4" />
              {t('profile.referralInvite')}
            </button>
          )}
        </div>
      </section>

      <XpHistoryModal open={xpHistoryOpen} onClose={() => setXpHistoryOpen(false)} />

      <MobileQuickLinks />
    </div>
  );
}
