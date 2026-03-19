import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface LoginPageProps {
  onLogin: (phone: string, password: string) => Promise<unknown>;
  onRegister: (name: string, phone: string, password: string) => Promise<unknown>;
}

export default function LoginPage({ onLogin, onRegister }: LoginPageProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await onRegister(name, phone, password);
      } else {
        await onLogin(phone, password);
      }
      void navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errorFallback'));
    } finally {
      setLoading(false);
    }
  }

  function handleSocialLogin(provider: 'kakao' | 'naver' | 'telegram' | 'apple') {
    window.location.href = `/api/auth/${provider}`;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 pt-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8">
          {isRegister ? t('auth.register') : t('auth.login')}
        </h1>

        {!isRegister && (
          <>
            <div className="space-y-3 mb-6">
              {/* Kakao */}
              <button
                type="button"
                onClick={() => handleSocialLogin('kakao')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#FEE500', color: '#000000' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M10 2C5.582 2 2 4.91 2 8.5c0 2.26 1.37 4.25 3.44 5.43L4.6 17.04a.25.25 0 0 0 .36.28l4.06-2.7c.32.04.65.06.98.06 4.418 0 8-2.91 8-6.5S14.418 2 10 2z"
                    fill="currentColor"
                  />
                </svg>
                {t('auth.kakaoLogin')}
              </button>

              {/* Naver */}
              <button
                type="button"
                onClick={() => handleSocialLogin('naver')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#03C75A', color: '#FFFFFF' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M11.44 10.22L8.26 5H5v10h3.56V9.78L11.74 15H15V5h-3.56v5.22z"
                    fill="currentColor"
                  />
                </svg>
                {t('auth.naverLogin')}
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={() => handleSocialLogin('telegram')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#0088CC', color: '#FFFFFF' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M2.19 9.63 16.54 4.07c.69-.25 1.3.17 1.07.86l-2.37 11.17c-.17.8-.66 1-1.34.62l-3.72-2.74-1.8 1.73c-.2.2-.37.36-.75.36l.27-3.8 6.9-6.23c.3-.27-.07-.42-.46-.15L5.02 12.09l-3.64-1.14c-.79-.25-.81-.79.17-1.12z"
                    fill="currentColor"
                  />
                </svg>
                {t('auth.telegramLogin')}
              </button>

              {/* Apple — Apple Human Interface Guidelines 준수: 검정 배경 + 흰색 로고 */}
              <button
                type="button"
                onClick={() => handleSocialLogin('apple')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M13.18 2C13.3 3.25 12.8 4.44 12.09 5.3c-.72.88-1.87 1.56-3.03 1.47-.15-1.23.43-2.5 1.1-3.3C10.87 2.6 12.1 1.9 13.18 2zm3.34 11.24c-.5 1.1-1.09 1.97-1.97 2.84-.77.76-1.57 1.03-2.24.98-.67-.05-1.47-.44-2.31-.44-.85 0-1.67.41-2.33.44-.66.03-1.48-.22-2.27-1.01C2.57 14.06 1 11.23 1 8.5c0-3.14 2.06-4.8 4.07-4.83 1.06-.02 2 .62 2.64.62.64 0 1.73-.7 2.97-.67.51.02 1.94.21 2.86 1.57-.07.05-1.71 1-1.69 2.97.02 2.36 2.08 3.14 2.1 3.15-.02.07-.33 1.12-1.03 2.13z"
                    fill="currentColor"
                  />
                </svg>
                {t('auth.appleLogin')}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-sm text-gray-400">{t('auth.orDivider')}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('auth.name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('auth.phone')}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              autoComplete="tel"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? t('auth.processing') : isRegister ? t('auth.register') : t('auth.login')}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            {isRegister ? t('auth.login') : t('auth.register')}
          </button>
        </p>
      </div>
    </div>
  );
}
