import { useEffect } from 'react';
import { TOKEN_STORAGE_KEY } from '@findthem/shared';

export default function AuthCallbackPage() {
  useEffect(() => {
    // hash fragment에서 토큰 읽기 (query string보다 안전 — 서버 로그/Referrer에 노출 안 됨)
    const hash = window.location.hash.slice(1); // '#' 제거
    const params = new URLSearchParams(hash);
    const token = params.get('token');

    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }

    // full reload로 useAuth가 /auth/me를 다시 호출하도록 함
    window.location.replace('/');
  }, []);

  return null;
}
