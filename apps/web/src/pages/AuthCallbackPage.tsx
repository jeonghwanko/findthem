import { useEffect } from 'react';
import { TOKEN_STORAGE_KEY } from '@findthem/shared';

export default function AuthCallbackPage() {
  useEffect(() => {
    const hash = window.location.hash.slice(1); // '#' 제거
    const params = new URLSearchParams(hash);

    // 카카오/네이버 콜백: #token=xxx
    const token = params.get('token');
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      window.location.replace('/');
      return;
    }

    // 텔레그램 콜백: #tgAuthResult=<base64 JSON>
    const tgAuthResult = params.get('tgAuthResult');
    if (tgAuthResult) {
      try {
        const authData = JSON.parse(atob(tgAuthResult)) as Record<string, string>;
        fetch('/api/auth/telegram/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(authData),
        })
          .then((res) => res.json())
          .then((data: { token?: string }) => {
            if (data.token) {
              localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
            }
            window.location.replace('/');
          })
          .catch(() => {
            window.location.replace('/login');
          });
      } catch {
        window.location.replace('/login');
      }
      return;
    }

    // 알 수 없는 콜백
    window.location.replace('/');
  }, []);

  return null;
}
