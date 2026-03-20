import { useState, useEffect, useCallback } from 'react';
import { api, type User } from '../api/client';
import { TOKEN_STORAGE_KEY, FCM_TOKEN_STORAGE_KEY } from '@findthem/shared';

async function syncFcmToken() {
  const token = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  if (!token) return;
  try {
    await api.post('/users/me/fcm-token', { token });
  } catch {
    // 무시
  }
}

async function applyPendingReferral() {
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

interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
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
