import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOKEN_STORAGE_KEY } from '@findthem/shared';
import { api, type User } from '../api/client';
import { IS_NATIVE } from '../utils/webOrigin';

/**
 * 네이티브 OAuth 콜백 훅.
 *
 * Browser.open()으로 열린 SFSafariViewController/Chrome Custom Tabs에서
 * Universal Link (https://union.pryzm.gg/auth/callback#token=...) 를 받으면:
 * 1. 인앱 브라우저 닫기
 * 2. 토큰 추출 → localStorage 저장
 * 3. /auth/me fetch → 사용자 상태 갱신
 * 4. 홈으로 이동
 */
export function useNativeOAuth(updateUser: (user: User) => void) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!IS_NATIVE) return;

    let cleanup: (() => void) | undefined;

    void (async () => {
      const { App: CapApp } = await import('@capacitor/app');
      const handle = await CapApp.addListener('appUrlOpen', async (data) => {
        if (!data.url.includes('/auth/callback')) return;

        // 인앱 브라우저 닫기
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch { /* 이미 닫힘 무시 */ }

        // 토큰 추출 (hash: #token=xxx 또는 #tgAuthResult=xxx)
        let hash: string;
        try {
          hash = new URL(data.url).hash.slice(1);
        } catch {
          return;
        }
        const params = new URLSearchParams(hash);
        const token = params.get('token');
        if (!token) return;

        // 토큰 저장 + 사용자 정보 갱신
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        try {
          const user = await api.get<User>('/auth/me');
          updateUser(user);
          void navigate('/');
        } catch { /* 토큰 무효 — 무시 */ }
      });

      cleanup = () => handle.remove();
    })();

    return () => cleanup?.();
  }, [navigate, updateUser]);
}
