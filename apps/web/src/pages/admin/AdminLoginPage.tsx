import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '../../hooks/useAdminApi.js';

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAdminAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await login(key.trim());
      void navigate('/admin');
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('admin.authFailed') }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">관리자 로그인</h1>
        <p className="text-sm text-gray-500 mb-6">API Key를 입력하세요.</p>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin API Key"
            autoComplete="off"
            className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!key.trim() || loading}
            className="w-full bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? '인증 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
