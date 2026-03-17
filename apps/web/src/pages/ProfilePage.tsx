import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User as UserIcon, Mail, Calendar, Shield, Save } from 'lucide-react';
import { api, type User } from '../api/client';

interface ProfilePageProps {
  user: User;
  onUserUpdate: (user: User) => void;
}

export default function ProfilePage({ user, onUserUpdate }: ProfilePageProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const initial = user.name?.charAt(0)?.toUpperCase() || '?';
  const hasChanges = name !== user.name || (email || null) !== (user.email || null);

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.patch<User>('/auth/me', {
        name: name !== user.name ? name : undefined,
        email: email !== (user.email ?? '') ? (email || null) : undefined,
      });
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

  return (
    <div className="max-w-lg mx-auto px-4 pt-12 pb-8">
      <h1 className="text-2xl font-bold mb-8">{t('profile.title')}</h1>

      {/* 프로필 이미지 */}
      <div className="flex justify-center mb-8">
        {user.profileImage ? (
          <img
            src={user.profileImage}
            alt={user.name}
            className="w-24 h-24 rounded-full object-cover border-4 border-gray-100"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-3xl font-bold border-4 border-gray-100">
            {initial}
          </div>
        )}
      </div>

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

        {/* 저장 버튼 */}
        {hasChanges && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? t('profile.saving') : t('profile.save')}
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
