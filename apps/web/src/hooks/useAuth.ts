import { useState, useEffect, useCallback } from 'react';
import { api, type User } from '../api/client';
import { TOKEN_STORAGE_KEY } from '@findthem/shared';

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
      .then((user) => setState({ user, loading: false }))
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
    return res.user;
  }, []);

  const register = useCallback(
    async (name: string, phone: string, password: string) => {
      const res = await api.post<{ user: User; token: string }>('/auth/register', {
        name,
        phone,
        password,
      });
      localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
      setState({ user: res.user, loading: false });
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
