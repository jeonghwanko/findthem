import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User as UserIcon, Mail, Calendar, Shield, Save, Camera, Star, Gift, Users } from 'lucide-react';
import { api, type User } from '../api/client';
import { MAX_FILE_SIZE } from '@findthem/shared';
import type { SponsorXpStats } from '@findthem/shared';

interface ProfilePageProps {
  user: User;
  onUserUpdate: (user: User) => void;
}

export default function ProfilePage({ user, onUserUpdate }: ProfilePageProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [xpStats, setXpStats] = useState<SponsorXpStats | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSharingRef = useRef(false);

  // 컴포넌트 unmount 시 타이머 정리
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void api.get<SponsorXpStats>('/users/me/xp-stats')
      .then((data) => setXpStats(data))
      .catch(() => {/* 무시 */});

    // 기존 사용자 중 referralCode가 없는 경우 자동 발급
    if (!user.referralCode) {
      void api.post<{ referralCode: string }>('/auth/me/referral-code')
        .then((data) => onUserUpdate({ ...user, referralCode: data.referralCode }))
        .catch(() => {/* 무시 */});
    }
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
      setMessage({ type: 'success', text: t('profile.saved') });
    } catch {
      setMessage({ type: 'error', text: t('profile.saveFailed') });
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

  async function handleReferralShare() {
    if (isSharingRef.current || !user.referralCode) return;
    isSharingRef.current = true;
    try {
      const referralUrl = `${window.location.origin}?ref=${user.referralCode}`;
      const shareTitle = t('profile.referralShareTitle');
      const shareDesc = t('profile.referralShareDesc');

      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareDesc, url: referralUrl });
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
              imageUrl: `${window.location.origin}/pwa-512x512.png`,
              link: { mobileWebUrl: referralUrl, webUrl: referralUrl },
            },
            buttons: [{ title: t('profile.referralJoin'), link: { mobileWebUrl: referralUrl, webUrl: referralUrl } }],
          });
          return;
        } catch {
          // Kakao SDK 실패 → 클립보드 fallback
        }
      }

      // 최종 fallback: 클립보드 복사
      try {
        await navigator.clipboard.writeText(referralUrl);
      } catch {
        window.prompt(t('profile.referralCode'), referralUrl);
      }
    } finally {
      isSharingRef.current = false;
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: t('errors.IMAGE_ONLY') });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessage({ type: 'error', text: t('upload.limit', { max: 1 }) });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const updated = await api.post<User>('/auth/me/photo', form);
      onUserUpdate(updated);
      setMessage({ type: 'success', text: t('profile.photoSaved') });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: t(`errors.${code}`, { defaultValue: t('profile.photoFailed') }) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-12 pb-8">
      <h1 className="text-2xl font-bold mb-8">{t('profile.title')}</h1>

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
            {t('profile.sponsorLevel', { level: xpStats.userLevel })}
          </span>
          <div className="flex-1 h-2.5 bg-pink-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-rose-400 rounded-full transition-all duration-700"
              style={{ width: `${xpStats.xpRequiredForLevel > 0 ? Math.round((xpStats.currentXP / xpStats.xpRequiredForLevel) * 100) : 100}%` }}
            />
          </div>
          <span className="text-xs text-pink-400 whitespace-nowrap flex-shrink-0">
            {xpStats.xpToNextLevel === 0
              ? t('profile.xpMaxLevel')
              : t('profile.xpProgress', { current: xpStats.currentXP.toLocaleString(), total: xpStats.xpRequiredForLevel.toLocaleString() })}
          </span>
        </div>
      )}

      {/* 정보 폼 */}
      <div className="space-y-5">
        {/* 이름 */}
        <div>
          <label htmlFor="profile-name" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <UserIcon className="w-4 h-4" />
            {t('profile.name')}
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
            {t('profile.email')}
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('profile.emailPlaceholder')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* 로그인 방식 */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Shield className="w-4 h-4" />
            {t('profile.provider')}
          </div>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
            {t(`profile.provider_${(user.provider ?? 'LOCAL').toLowerCase()}`)}
          </div>
        </div>

        {/* 가입일 */}
        {user.createdAt && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="w-4 h-4" />
              {t('profile.joinDate')}
            </div>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
              {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* 레퍼럴 코드 */}
        {user.referralCode && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Gift className="w-4 h-4" />
              {t('profile.referralCode')}
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
                {referralCopied ? t('profile.referralCopied') : t('profile.referralCopy')}
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
          {saving ? t('profile.saving') : t('profile.save')}
        </button>

        {/* 레퍼럴 초대 버튼 */}
        {user.referralCode && (
          <button
            type="button"
            onClick={() => void handleReferralShare()}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            <Users className="w-4 h-4" />
            {t('profile.referralInvite')}
          </button>
        )}

        {message && (
          <p className={`text-sm text-center ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
