import { useState, useRef, useEffect, useCallback } from 'react';
import { User as UserIcon, Mail, Calendar, Shield, Save, Camera, Star, Gift, Users, Bell, BellOff, TicketCheck } from 'lucide-react';
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

const PROVIDER_LABELS: Record<string, string> = {
  local: '이메일/비밀번호',
  kakao: '카카오',
  naver: '네이버',
  apple: '애플',
};

const ERROR_MESSAGES: Record<string, string> = {
  IMAGE_ONLY: '이미지 파일만 업로드할 수 있습니다',
  FILE_TOO_LARGE: '파일 크기가 너무 큽니다 (최대 10MB)',
};

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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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

  // 컴포넌트 unmount 시 타이머 정리
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const fetchXpStats = useCallback(async () => {
    const data = await api.get<XpStats>('/users/me/xp-stats').catch(() => null);
    if (data) setXpStats(data);
  }, []);

  usePullToRefresh(fetchXpStats);

  useEffect(() => {
    void fetchXpStats();

    // 기존 사용자 중 referralCode가 없는 경우 자동 발급
    if (!user.referralCode) {
      void api.post<{ referralCode: string }>('/auth/me/referral-code')
        .then((data) => onUserUpdate({ ...user, referralCode: data.referralCode }))
        .catch(() => {/* 무시 */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = user.name?.charAt(0)?.toUpperCase() || '?';
  const hasChanges = name !== user.name || (email || null) !== (user.email || null);

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {};
      if (name !== user.name) body.name = name;
      if (email !== (user.email ?? '')) body.email = email || null;
      const updated = await api.patch<User>('/auth/me', body);
      onUserUpdate(updated);
      setName(updated.name);
      setEmail(updated.email ?? '');
      setMessage({ type: 'success', text: '저장되었습니다' });
    } catch {
      setMessage({ type: 'error', text: '저장에 실패했습니다' });
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyReferral() {
    if (!user.referralCode) return;
    try {
      await navigator.clipboard.writeText(user.referralCode);
    } catch {
      window.prompt('추천 코드', user.referralCode);
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
          prev
            ? {
                ...prev,
                xp: result.newXp,
                level: result.newLevel,
              }
            : prev,
        );
      }
    } catch {/* 무시 */}
  }

  async function handleReferralShare() {
    if (isSharingRef.current || !user.referralCode) return;
    isSharingRef.current = true;
    try {
      const referralUrl = `${getWebOrigin()}/invite?ref=${user.referralCode}`;
      const shareTitle = '찾아줘 — 함께 찾아요';
      const shareDesc = '실종된 반려동물/사람을 AI로 찾는 서비스에 함께해요!';

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
            buttons: [{ title: '가입하기', link: { mobileWebUrl: referralUrl, webUrl: referralUrl } }],
          });
          await claimShareReward();
          return;
        } catch {
          // Kakao SDK 실패 → 클립보드 fallback
        }
      }

      // 최종 fallback: 클립보드 복사
      try {
        await navigator.clipboard.writeText(referralUrl);
      } catch {
        window.prompt('추천 링크', referralUrl);
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
        setMessage({ type: 'success', text: t('invite.applySuccess') });
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
      setMessage({ type: 'error', text: '이미지 파일만 업로드할 수 있습니다' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessage({ type: 'error', text: '최대 1장, 장당 10MB 이하' });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const updated = await api.post<User>('/auth/me/photo', form);
      onUserUpdate(updated);
      setMessage({ type: 'success', text: '프로필 사진이 저장되었습니다' });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: ERROR_MESSAGES[code] ?? '사진 업로드에 실패했습니다' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-12 pb-8">
      <h1 className="text-2xl font-bold mb-8">내 정보</h1>

      {/* 프로필 이미지 — hover 시 카메라 오버레이 */}
      <div className="flex justify-center mb-8">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative group w-24 h-24 rounded-full overflow-hidden border-4 border-gray-100 cursor-pointer disabled:cursor-wait"
        >
          {user.profileImage ? (
            <img
              src={user.profileImage.replace(/^http:\/\//, 'https://')}
              alt={user.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-primary-100 text-primary-700 flex items-center justify-center text-3xl font-bold">
              {initial}
            </div>
          )}
          {!uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
      </div>

      {/* 후원 XP & 레벨 */}
      {xpStats && (
        <div className="mb-6 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Star className="w-4 h-4 fill-pink-400 text-pink-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-pink-600 whitespace-nowrap">
            레벨 {xpStats.level}
          </span>
          <div className="flex-1 h-2.5 bg-pink-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-rose-400 rounded-full transition-all duration-700"
              style={{ width: `${xpStats.xpRequiredForLevel > 0 ? Math.round((xpStats.currentXP / xpStats.xpRequiredForLevel) * 100) : 100}%` }}
            />
          </div>
          <span className="text-xs text-pink-400 whitespace-nowrap flex-shrink-0">
            {xpStats.xpToNextLevel === 0
              ? '최고 레벨'
              : `${xpStats.currentXP.toLocaleString()} / ${xpStats.xpRequiredForLevel.toLocaleString()} XP`}
          </span>
        </div>
      )}

      {/* 정보 폼 */}
      <div className="space-y-5">
        {/* 이름 */}
        <div>
          <label htmlFor="profile-name" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <UserIcon className="w-4 h-4" />
            이름
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* 이메일 */}
        <div>
          <label htmlFor="profile-email" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Mail className="w-4 h-4" />
            이메일
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일을 입력하세요 (선택)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* 로그인 방식 */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Shield className="w-4 h-4" />
            로그인 방식
          </div>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
            {PROVIDER_LABELS[(user.provider ?? 'LOCAL').toLowerCase()] ?? (user.provider ?? 'LOCAL')}
          </div>
        </div>

        {/* 가입일 */}
        {user.createdAt && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="w-4 h-4" />
              가입일
            </div>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
              {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* 추천 코드 입력 (아직 추천인이 없는 경우) */}
        {!referralApplied && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 mb-1.5">
              <TicketCheck className="w-4 h-4" />
              {t('invite.applyTitle')}
            </div>
            <p className="text-xs text-indigo-600/70 mb-2">{t('invite.applyDesc')}</p>
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

        {/* 레퍼럴 코드 */}
        {user.referralCode && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Gift className="w-4 h-4" />
              추천 코드
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm font-mono tracking-widest">
                {user.referralCode}
              </div>
              <button
                type="button"
                onClick={() => void handleCopyReferral()}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                {referralCopied ? '복사됨!' : '복사'}
              </button>
            </div>
          </div>
        )}

        {/* 저장 버튼 */}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges || !name.trim()}
          className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? '저장 중...' : '저장'}
        </button>

        {/* 레퍼럴 초대 버튼 */}
        {user.referralCode && (
          <button
            type="button"
            onClick={() => void handleReferralShare()}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            <Users className="w-4 h-4" />
            친구 초대하기
          </button>
        )}

        {/* 알림 설정 */}
        {isSupported && (
          <div className="flex items-center justify-between py-3 border-t border-gray-100 mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              {subscribed ? <Bell className="w-4 h-4 text-primary-600" /> : <BellOff className="w-4 h-4 text-gray-400" />}
              푸시 알림
            </div>
            <button
              type="button"
              onClick={() => { void (subscribed ? unsubscribe() : subscribe()); }}
              disabled={pushLoading}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                subscribed
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {subscribed ? '알림 끄기' : '알림 켜기'}
            </button>
          </div>
        )}

        {message && (
          <p className={`text-sm text-center ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* XP 이력 보기 버튼 */}
      {xpStats && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setXpHistoryOpen(true)}
            className="w-full flex items-center justify-center gap-2 border border-pink-200 text-pink-600 hover:bg-pink-50 py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            <Star className="w-4 h-4" />
            XP 이력 보기
          </button>
        </div>
      )}

      <XpHistoryModal open={xpHistoryOpen} onClose={() => setXpHistoryOpen(false)} />

      <MobileQuickLinks />
    </div>
  );
}
