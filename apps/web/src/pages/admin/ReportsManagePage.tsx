import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../api/admin.js';
import type { ReportSummary, ReportStatus, SubjectType } from '@findthem/shared';

interface AdminReportListResponse {
  reports: ReportSummary[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체 상태' },
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'FOUND', label: 'FOUND' },
  { value: 'SUSPENDED', label: 'SUSPENDED' },
  { value: 'EXPIRED', label: 'EXPIRED' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체 유형' },
  { value: 'PERSON', label: '사람' },
  { value: 'DOG', label: '강아지' },
  { value: 'CAT', label: '고양이' },
];

const STATUS_BADGE: Record<ReportStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  FOUND: 'bg-blue-100 text-blue-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

const TYPE_LABEL: Record<SubjectType, string> = {
  PERSON: '사람',
  DOG: '강아지',
  CAT: '고양이',
};

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function ReportsManagePage() {
  const [status, setStatus] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminReportListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (subjectType) params.set('subjectType', subjectType);
      if (q) params.set('q', q);
      params.set('page', String(page));
      params.set('limit', '20');
      const result = await adminApi.get<AdminReportListResponse>(
        `/admin/reports?${params.toString()}`,
      );
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [status, subjectType, q, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSearch() {
    setQ(searchInput);
    setPage(1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch();
  }

  async function handleStatusChange(report: ReportSummary) {
    const nextStatus: ReportStatus =
      report.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const label = nextStatus === 'SUSPENDED' ? '정지' : '복구';
    const reason =
      nextStatus === 'SUSPENDED'
        ? window.prompt(`신고 ${shortId(report.id)}를 정지하는 이유를 입력하세요.`)
        : '관리자 복구';

    if (reason === null) return; // 취소

    if (!window.confirm(`신고 ${shortId(report.id)}를 ${label}하시겠습니까?`)) return;

    setActionLoading(report.id);
    try {
      await adminApi.patch(`/admin/reports/${report.id}/status`, {
        status: nextStatus,
        reason,
      });
      await fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '상태 변경 실패');
    } finally {
      setActionLoading(null);
    }
  }

  const reports = data?.reports ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-5">신고 관리</h1>

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

        <select
          value={subjectType}
          onChange={(e) => { setSubjectType(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이름, 장소 검색..."
            className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none w-52"
          />
          <button
            onClick={handleSearch}
            className="bg-indigo-600 text-white rounded px-3 py-1.5 text-sm hover:bg-indigo-700"
          >
            검색
          </button>
        </div>

        <button
          onClick={fetchData}
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
              <th className="px-4 py-3 font-medium text-gray-600 border-b">유형</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">이름</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">상태</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">장소</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b text-center">제보수</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">생성일</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading && reports.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  신고가 없습니다.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {shortId(report.id)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {TYPE_LABEL[report.subjectType]}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{report.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[report.status]}`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                    {report.lastSeenAddress}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {report._count?.sightings ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(report.createdAt)}</td>
                  <td className="px-4 py-3">
                    {(report.status === 'ACTIVE' || report.status === 'SUSPENDED') && (
                      <button
                        onClick={() => handleStatusChange(report)}
                        disabled={actionLoading === report.id}
                        className={`rounded px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                          report.status === 'SUSPENDED'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {actionLoading === report.id
                          ? '처리 중...'
                          : report.status === 'SUSPENDED'
                          ? '복구'
                          : '정지'}
                      </button>
                    )}
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
