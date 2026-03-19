import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../api/admin.js';
import type { MatchStatus, AdminMatchItem, AdminMatchListResponse } from '@findthem/shared';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체 상태' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'REJECTED', label: 'REJECTED' },
  { value: 'NOTIFIED', label: 'NOTIFIED' },
];

const STATUS_BADGE: Record<MatchStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  NOTIFIED: 'bg-blue-100 text-blue-700',
};

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR');
}

function truncate(str: string, n: number) {
  return str.length > n ? `${str.slice(0, n)}...` : str;
}

export default function MatchesManagePage() {
  const [status, setStatus] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminMatchListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (minConfidence) params.set('minConfidence', minConfidence);
      params.set('page', String(page));
      params.set('limit', '20');
      const result = await adminApi.get<AdminMatchListResponse>(
        `/admin/matches?${params.toString()}`,
      );
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [status, minConfidence, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleAction(matchId: string, action: 'CONFIRMED' | 'REJECTED') {
    const label = action === 'CONFIRMED' ? '확인' : '거부';
    if (!window.confirm(`매칭을 ${label}하시겠습니까?`)) return;

    setActionLoading(matchId);
    try {
      await adminApi.patch(`/admin/matches/${matchId}/status`, { status: action });
      await fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  const matches = data?.matches ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-lg lg:text-xl font-bold text-gray-900 mb-5">매칭 관리</h1>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">최소 신뢰도</label>
          <input
            type="number"
            min="0"
            max="100"
            value={minConfidence}
            onChange={(e) => { setMinConfidence(e.target.value); setPage(1); }}
            placeholder="0 ~ 100"
            className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-24"
          />
          <span className="text-sm text-gray-500">%</span>
        </div>

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
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600 border-b">ID</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">신고</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">제보</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b text-right">신뢰도</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">상태</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">AI 판단</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">생성일</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading && matches.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : matches.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  매칭 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              matches.map((match) => (
                <tr key={match.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {shortId(match.id)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 max-w-[120px] truncate">
                    {match.report?.name ?? shortId(match.id)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">
                    {match.sighting?.description
                      ? truncate(match.sighting.description, 30)
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-semibold ${
                        match.confidence >= 0.8
                          ? 'text-green-600'
                          : match.confidence >= 0.6
                          ? 'text-yellow-600'
                          : 'text-gray-500'
                      }`}
                    >
                      {(match.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[match.status]}`}
                    >
                      {match.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">
                    {truncate(match.aiReasoning ?? '', 40)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(match.createdAt)}</td>
                  <td className="px-4 py-3">
                    {match.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { void handleAction(match.id, 'CONFIRMED'); }}
                          disabled={actionLoading === match.id}
                          className="rounded px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => { void handleAction(match.id, 'REJECTED'); }}
                          disabled={actionLoading === match.id}
                          className="rounded px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                        >
                          거부
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
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
