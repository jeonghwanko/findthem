import { useState } from 'react';
import { useAdminAuth } from '../../hooks/useAdminApi.js';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: '인증에 실패했습니다',
  INVALID_API_KEY: '올바르지 않은 API 키입니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, login } = useAdminAuth();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
          <h2 className="text-xl font-bold mb-4 text-center">관리자 인증</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              void (async () => {
                try {
                  await login(key);
                } catch (err: unknown) {
                  const code = err instanceof Error ? err.message : '';
                  setError(ERROR_MESSAGES[code] ?? '인증에 실패했습니다');
                }
              })();
            }}
          >
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="API Key"
              autoComplete="off"
              className="w-full border rounded px-3 py-2 mb-3"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              type="submit"
              className="w-full bg-primary-600 text-white py-2 rounded hover:bg-primary-700"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
