import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOKEN_STORAGE_KEY } from '@findthem/shared';
import { api } from '../api/client';
import { applyPendingReferral } from '../hooks/useAuth';

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);

    // 카카오/네이버/Apple 콜백: #token=xxx
    // 토큰은 이미 useAuth가 동기적으로 추출하여 /auth/me 호출 중.
    // referral 처리 후 홈으로 이동만 담당.
    if (params.get('token')) {
      void applyPendingReferral().then(() => navigate('/', { replace: true }));
      return;
    }

    // 텔레그램 콜백: #tgAuthResult=<base64 JSON>
    const tgAuthResult = params.get('tgAuthResult');
    if (tgAuthResult) {
      void (async () => {
        try {
          const authData = JSON.parse(atob(tgAuthResult)) as Record<string, string>;
          const res = await api.post<{ token: string }>('/auth/telegram/callback', authData);
          localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
          await applyPendingReferral();
          navigate('/', { replace: true });
        } catch {
          navigate('/login', { replace: true });
        }
      })();
      return;
    }

    // 알 수 없는 콜백
    navigate('/', { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}
