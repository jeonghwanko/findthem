import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IS_NATIVE } from '../utils/webOrigin';
import MobileQuickLinks from '../components/MobileQuickLinks';

interface LoginPageProps {
  onLogin: (phone: string, password: string) => Promise<unknown>;
  onRegister: (name: string, phone: string, password: string) => Promise<unknown>;
}

export default function LoginPage({ onLogin, onRegister }: LoginPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      const code = err instanceof Error ? err.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('auth.errorFallback') }));
    } finally {
      setLoading(false);
    }
  }

  function handleSocialLogin(provider: 'kakao' | 'naver' | 'apple') {
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';
    const url = IS_NATIVE ? `${apiBase}/auth/${provider}?native=1` : `${apiBase}/auth/${provider}`;
    if (IS_NATIVE) {
      // 네이티브: SFSafariViewController / Chrome Custom Tabs (인앱 모달)
      // → Universal Link(iOS) / App Links(Android) 콜백 → useNativeOAuth에서 처리
      void import('@capacitor/browser')
        .then(({ Browser }) => Browser.open({ url, presentationStyle: 'popover' }))
        .catch(() => {
          // Browser 플러그인 실패 시 WebView 내비게이션으로 폴백
          window.location.href = url;
        });
    } else {
      window.location.href = url;
    }
  }

  return (
    <div
      className="flex items-start justify-center px-4 pb-4 min-h-[60vh]"
      style={{
        // 네이티브는 Header가 없으므로 노치 높이만큼 추가 패딩 필요
        paddingTop: IS_NATIVE ? 'calc(env(safe-area-inset-top) + 1.5rem)' : '2rem',
      }}
    >
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center mb-5">
          {isRegister ? t('auth.register') : t('auth.login')}
        </h1>

        {!isRegister && (
          <>
            <div className="space-y-2.5 mb-5">
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

              {/* Apple HIG: black background + white logo */}
              <button
                type="button"
                onClick={() => handleSocialLogin('apple')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
              >
                <svg width="20" height="20" viewBox="0 0 256 315" fill="none" aria-hidden="true">
                  <path
                    d="M213.803 167.03c.442 47.58 41.74 63.413 42.197 63.615-.35 1.116-6.599 22.563-21.757 44.716-13.104 19.153-26.705 38.235-48.13 38.63-21.05.388-27.82-12.483-51.888-12.483-24.061 0-31.582 12.088-51.51 12.871-20.68.783-36.428-20.71-49.64-39.793C7.392 235.65-18.253 155.775 8.37 103.156 21.577 77.044 48.518 60.716 77.737 60.328c20.327-.386 39.49 13.67 51.883 13.67 12.392 0 35.658-16.9 60.11-14.42 10.229.427 38.943 4.132 57.37 31.108-1.487.93-34.25 19.996-33.897 59.644M174.24 39.4C185.218 26.326 192.607 8.47 190.63 0c-15.33.636-33.88 10.22-44.86 23.293-9.85 11.58-18.473 30.13-16.153 47.895 17.092 1.33 34.58-8.69 44.623-21.788"
                    fill="currentColor"
                  />
                </svg>
                {t('auth.appleLogin')}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-sm text-gray-400">{t('auth.orDivider')}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
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
              autoComplete="off"
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
              autoComplete="off"
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

        <p className="text-center text-sm text-gray-500 mt-3">
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

        <MobileQuickLinks />
      </div>
    </div>
  );
}
