import { useState, useEffect, useCallback } from 'react';
import { api, type User } from '../api/client';
import { TOKEN_STORAGE_KEY, FCM_TOKEN_STORAGE_KEY } from '@findthem/shared';
import { IS_NATIVE } from '../utils/webOrigin';

async function syncFcmToken() {
  const token = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  if (!token) return;
  try {
    await api.post('/users/me/fcm-token', { token });
  } catch {
    // 무시
  }
}

export async function applyPendingReferral() {
  const referralCode = sessionStorage.getItem('referralCode');
  if (!referralCode) return;
  try {
    await api.post('/auth/me/apply-referral', { referralCode });
  } catch {
    // 무시 (이미 적용됐거나 유효하지 않은 코드)
  } finally {
    sessionStorage.removeItem('referralCode');
  }
}

/**
 * 웹 OAuth 콜백 페이지에서 hash의 토큰을 동기적으로 추출.
 * 네이티브는 useNativeOAuth가 appUrlOpen 이벤트로 별도 처리하므로 제외.
 */
function extractCallbackToken(): string | null {
  if (IS_NATIVE) return null;
  if (window.location.pathname !== '/auth/callback') return null;
  const hash = window.location.hash.slice(1);
  return new URLSearchParams(hash).get('token');
}

interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    // localStorage 우선, 없으면 OAuth 콜백 hash에서 추출
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const callbackToken = storedToken ? null : extractCallbackToken();
    const token = storedToken ?? callbackToken;

    if (callbackToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, callbackToken);
    }

    if (!token) {
      // 텔레그램 콜백(#tgAuthResult)은 AuthCallbackPage에서 비동기 처리 —
      // loading: false로 전환하되, 텔레그램 처리 완료 시 setUser로 복구됨
      setState({ user: null, loading: false });
      return;
    }

    api.get<User>('/auth/me')
      .then((user) => {
        setState({ user, loading: false });
        void syncFcmToken();
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setState({ user: null, loading: false });
      });
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api.post<{ user: User; token: string }>('/auth/login', {
      phone,
      password,
    });
    localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
    setState({ user: res.user, loading: false });
    void syncFcmToken();
    void applyPendingReferral();
    return res.user;
  }, []);

  const register = useCallback(
    async (name: string, phone: string, password: string) => {
      const referralCode = sessionStorage.getItem('referralCode') ?? undefined;
      const res = await api.post<{ user: User; token: string }>('/auth/register', {
        name,
        phone,
        password,
        ...(referralCode ? { referralCode } : {}),
      });
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      setState({ user: res.user, loading: false });
      void syncFcmToken();
      // 회원가입 시 referralCode를 body에 포함했으므로 sessionStorage 정리
      sessionStorage.removeItem('referralCode');
      return res.user;
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setState({ user: null, loading: false });
  }, []);

  const updateUser = useCallback((user: User) => {
    setState((prev) => ({ ...prev, user }));
  }, []);

  return { ...state, login, register, logout, updateUser };
}
