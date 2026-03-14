import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../api/admin.js';

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  createdAt: string;
  _count?: { reports: number };
  blockedAt?: string | null;
  blockReason?: string | null;
}

interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
}

const BLOCKED_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'false', label: '정상' },
  { value: 'true', label: '차단됨' },
];

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function UsersManagePage() {
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [blocked, setBlocked] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (blocked) params.set('blocked', blocked);
      params.set('page', String(page));
      params.set('limit', '20');
      const result = await adminApi.get<AdminUserListResponse>(
        `/admin/users?${params.toString()}`,
      );
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [q, blocked, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function handleSearch() {
    setQ(searchInput);
    setPage(1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch();
  }

  async function handleToggleBlock(user: AdminUser) {
    const isBlocked = !!user.blockedAt;

    if (isBlocked) {
      if (!window.confirm(`사용자 ${user.name}의 차단을 해제하시겠습니까?`)) return;
      setActionLoading(user.id);
      try {
        await adminApi.patch(`/admin/users/${user.id}/block`, { blocked: false });
        await fetchData();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : '처리 실패');
      } finally {
        setActionLoading(null);
      }
    } else {
      const reason = window.prompt(`사용자 ${user.name}을 차단하는 이유를 입력하세요.`);
      if (reason === null) return;
      if (!reason.trim()) {
        alert('사유를 입력해주세요.');
        return;
      }
      if (!window.confirm(`사용자 ${user.name}을 차단하시겠습니까?`)) return;
      setActionLoading(user.id);
      try {
        await adminApi.patch(`/admin/users/${user.id}/block`, { blocked: true, reason });
        await fetchData();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : '처리 실패');
      } finally {
        setActionLoading(null);
      }
    }
  }

  const users = data?.users ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-5">사용자 관리</h1>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이름, 전화번호 검색..."
            className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-52"
          />
          <button
            onClick={handleSearch}
            className="bg-indigo-600 text-white rounded px-3 py-1.5 text-sm hover:bg-indigo-700"
          >
            검색
          </button>
        </div>

        <select
          value={blocked}
          onChange={(e) => { setBlocked(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {BLOCKED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={() => { void fetchData(); }}
          disabled={loading}
          className="ml-auto border border-gray-300 rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600 border-b">ID</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">이름</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">전화번호</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">가입일</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b text-center">신고수</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">차단 상태</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  사용자가 없습니다.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {shortId(user.id)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.phone}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {user._count?.reports ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {user.blockedAt ? (
                      <div>
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
                          차단됨
                        </span>
                        {user.blockReason && (
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[140px] truncate">
                            {user.blockReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                        정상
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { void handleToggleBlock(user); }}
                      disabled={actionLoading === user.id}
                      className={`rounded px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        user.blockedAt
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {actionLoading === user.id
                        ? '처리 중...'
                        : user.blockedAt
                        ? '차단 해제'
                        : '차단'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-4 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
