import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../api/admin.js';
import type { AuditLogEntry, AdminActionSource } from '@findthem/shared';

interface AuditLogListResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

const TARGET_TYPE_OPTIONS = [
  { value: '', label: '전체 대상' },
  { value: 'REPORT', label: 'REPORT' },
  { value: 'SIGHTING', label: 'SIGHTING' },
  { value: 'MATCH', label: 'MATCH' },
  { value: 'USER', label: 'USER' },
  { value: 'PROMOTION', label: 'PROMOTION' },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체 소스' },
  { value: 'DASHBOARD', label: 'DASHBOARD' },
  { value: 'AGENT', label: 'AGENT' },
  { value: 'API', label: 'API' },
];

const SOURCE_BADGE: Record<AdminActionSource, string> = {
  DASHBOARD: 'bg-blue-100 text-blue-700',
  AGENT: 'bg-purple-100 text-purple-700',
  API: 'bg-gray-100 text-gray-700',
};

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

function JsonToggle({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return <span className="text-gray-400 text-xs">-</span>;
  }
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-indigo-600 text-xs hover:underline">
        {open ? '접기' : '상세 보기'}
      </summary>
      <pre className="mt-1 text-xs bg-gray-100 rounded p-2 overflow-auto max-h-40 max-w-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

export default function AuditLogPage() {
  const [targetType, setTargetType] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (targetType) params.set('targetType', targetType);
      if (source) params.set('source', source);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('page', String(page));
      params.set('limit', '30');
      const result = await adminApi.get<AuditLogListResponse>(
        `/admin/audit-logs?${params.toString()}`,
      );
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [targetType, source, from, to, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const logs = data?.logs ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">감사 로그</h1>
        <button
          onClick={() => { void fetchData(); }}
          disabled={loading}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={targetType}
          onChange={(e) => { setTargetType(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {TARGET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">기간</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <span className="text-gray-400">~</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
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
              <th className="px-4 py-3 font-medium text-gray-600 border-b whitespace-nowrap">시간</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">액션</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">대상 유형</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">대상 ID</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">소스</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">상세</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  감사 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">{log.action}</td>
                  <td className="px-4 py-3 text-gray-600">{log.targetType}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {shortId(log.targetId)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        SOURCE_BADGE[log.source] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {log.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <JsonToggle data={log.detail} />
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
