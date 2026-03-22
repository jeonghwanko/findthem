import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { Pencil, Trash2, CheckCircle, MapPin, Camera, Eye } from 'lucide-react';
import { api, type Report, type ReportListResponse, type ReportStatus, type Sighting, type SightingListResponse } from '../api/client';
import { formatTimeAgo, SUBJECT_TYPE_LABELS } from '@findthem/shared';
import { useTranslation } from 'react-i18next';
import { assetSrc } from '../utils/webOrigin';

const STATUS_STYLES: Record<ReportStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  FOUND: 'bg-blue-100 text-blue-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
  SUSPENDED: 'bg-red-100 text-red-600',
};

// SUBJECT_TYPE_LABELS는 @findthem/shared에서 가져옴 (ko 로케일 사용)
const SUBJECT_LABELS = SUBJECT_TYPE_LABELS['ko'];

const SUBJECT_TYPE_STYLES: Record<string, string> = {
  PERSON: 'bg-purple-100 text-purple-700',
  DOG: 'bg-yellow-100 text-yellow-700',
  CAT: 'bg-orange-100 text-orange-700',
};

function StatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {t(`report.status.${status}`, { defaultValue: status })}
    </span>
  );
}

function SubjectBadge({ type }: { type: Report['subjectType'] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SUBJECT_TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {SUBJECT_LABELS[type] ?? type}
    </span>
  );
}

type ActivityItem =
  | { kind: 'report'; data: Report; createdAt: string }
  | { kind: 'sighting'; data: Sighting; createdAt: string };

type Filter = 'all' | 'report' | 'sighting';

const PAGE_SIZE = 12;

export default function MyReportsPage() {
  const navigate = useNavigate();

  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, sightingsRes] = await Promise.all([
        api.get<ReportListResponse>('/reports/mine?page=1&limit=100'),
        api.get<SightingListResponse>('/sightings/mine?page=1&limit=100'),
      ]);
      const reports: ActivityItem[] = (reportsRes.items ?? []).map((r) => ({
        kind: 'report' as const,
        data: r,
        createdAt: r.createdAt,
      }));
      const sightings: ActivityItem[] = (sightingsRes.items ?? []).map((s) => ({
        kind: 'sighting' as const,
        data: s,
        createdAt: s.createdAt,
      }));
      const merged = [...reports, ...sightings].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setAllItems(merged);
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  usePullToRefresh(fetchAll);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [filter]);

  const counts = useMemo(() => {
    let report = 0;
    let sighting = 0;
    for (const item of allItems) {
      if (item.kind === 'report') report++;
      else sighting++;
    }
    return { all: report + sighting, report, sighting };
  }, [allItems]);

  const filtered = useMemo(
    () => filter === 'all' ? allItems : allItems.filter((item) => item.kind === filter),
    [allItems, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  if (clampedPage !== page) setPage(clampedPage);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const handleDelete = async (report: Report) => {
    if (!confirm(`"${report.name}" 신고를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setActionLoading(report.id);
    try {
      await api.delete(`/reports/${report.id}`);
      setAllItems((prev) => prev.filter((item) => !(item.kind === 'report' && item.data.id === report.id)));
    } catch {
      alert('삭제에 실패했습니다');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (report: Report) => {
    const nextStatus: ReportStatus = report.status === 'ACTIVE' ? 'FOUND' : 'ACTIVE';
    setActionLoading(report.id + '-status');
    try {
      await api.patch(`/reports/${report.id}/status`, { status: nextStatus });
      setAllItems((prev) =>
        prev.map((item) =>
          item.kind === 'report' && item.data.id === report.id
            ? { ...item, data: { ...item.data, status: nextStatus } }
            : item
        )
      );
    } catch {
      alert('상태 변경에 실패했습니다');
    } finally {
      setActionLoading(null);
    }
  };

  const primaryPhoto = (report: Report) =>
    report.photos.find((p) => p.isPrimary) ?? report.photos[0] ?? null;

  const filterButtons: { key: Filter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'report', label: '내 신고' },
    { key: 'sighting', label: '내 제보' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">내 활동</h1>
        <Link
          to="/sightings/new"
          className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-[0_3px_0_0_#c2410c] hover:translate-y-[1px] hover:shadow-[0_2px_0_0_#c2410c] active:translate-y-[3px] active:shadow-none transition-all"
        >
          목격 제보하기
        </Link>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-6">
        {filterButtons.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            <span className={`ml-1.5 text-xs ${filter === key ? 'text-gray-300' : 'text-gray-400'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">
            {filter === 'sighting' ? '제보 내역이 없습니다' : filter === 'report' ? '신고 내역이 없습니다' : '아직 활동 내역이 없습니다'}
          </p>
          <Link
            to={filter === 'sighting' ? '/sightings/new' : '/reports/new'}
            className="inline-block bg-gradient-to-r from-orange-500 to-rose-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {filter === 'sighting' ? '목격 제보하기' : '신고 등록하기'}
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {paged.map((item) => {
              if (item.kind === 'report') {
                const report = item.data;
                const photo = primaryPhoto(report);
                const isDeleting = actionLoading === report.id;
                const isTogglingStatus = actionLoading === report.id + '-status';
                const isBusy = isDeleting || isTogglingStatus;

                return (
                  <li
                    key={`r-${report.id}`}
                    onClick={() => navigate(`/reports/${report.id}`)}
                    className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:border-primary-300"
                  >
                    <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                      {photo ? (
                        <img src={assetSrc(photo.thumbnailUrl ?? photo.photoUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300"><Camera className="w-5 h-5" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600">
                          신고
                        </span>
                        <span className="font-semibold text-gray-900 truncate">{report.name}</span>
                        <SubjectBadge type={report.subjectType} />
                        <StatusBadge status={report.status} />
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {report.lastSeenAddress}
                        <span className="ml-2">{formatTimeAgo(report.createdAt, 'ko')}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {(report.status === 'ACTIVE' || report.status === 'FOUND') && (
                        <button type="button" onClick={() => { void handleToggleStatus(report); }} disabled={isBusy}
                          title={report.status === 'ACTIVE' ? '찾았어요 표시' : '찾는 중으로 변경'}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${report.status === 'FOUND' ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => { void navigate(`/reports/${report.id}/edit`); }} disabled={isBusy}
                        title="수정" className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => { void handleDelete(report); }} disabled={isBusy}
                        title="삭제" className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                        {isDeleting ? <span className="w-4 h-4 block border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </li>
                );
              }

              // sighting
              const sighting = item.data;
              const photo = sighting.photos?.[0];
              return (
                <li
                  key={`s-${sighting.id}`}
                  onClick={() => sighting.reportId && navigate(`/reports/${sighting.reportId}`)}
                  className={`flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm ${sighting.reportId ? 'cursor-pointer hover:border-primary-300' : ''}`}
                >
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                    {photo ? (
                      <img src={assetSrc(photo.thumbnailUrl ?? photo.photoUrl)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300"><Camera className="w-5 h-5" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600">
                        제보
                      </span>
                      <span className="font-semibold text-gray-900 truncate">
                        {sighting.description || '(설명 없음)'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {sighting.address}
                      <span className="ml-2">{formatTimeAgo(sighting.createdAt, 'ko')}</span>
                    </p>
                  </div>
                  {sighting.reportId && (
                    <div className="flex-shrink-0 text-gray-300">
                      <Eye className="w-4 h-4" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50">이전</button>
              <span className="text-sm text-gray-600">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50">다음</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
