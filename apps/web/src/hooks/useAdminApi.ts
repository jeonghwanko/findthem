import { useState, useEffect, useCallback } from 'react';
import { adminApi, setAdminKey, clearAdminKey } from '../api/admin.js';

export function useAdminAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = sessionStorage.getItem('ft_admin_key');
    if (!key) {
      setLoading(false);
      return;
    }

    adminApi
      .get('/admin/health')
      .then(() => setAuthenticated(true))
      .catch(() => {
        clearAdminKey();
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (key: string) => {
    setAdminKey(key);
    try {
      await adminApi.get('/admin/health');
      setAuthenticated(true);
    } catch {
      clearAdminKey();
      throw new Error('ADMIN_AUTH_FAILED');
    }
  }, []);

  const logout = useCallback(() => {
    clearAdminKey();
    setAuthenticated(false);
  }, []);

  return { authenticated, loading, login, logout };
}

export function useAdminData<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.get<T>(path);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]); // deps는 호출자가 제어하는 spread 배열

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
