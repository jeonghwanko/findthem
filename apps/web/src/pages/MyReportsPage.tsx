import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, CheckCircle } from 'lucide-react';
import { api, type Report, type ReportListResponse, type ReportStatus } from '../api/client';

function StatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useTranslation();
  const styles: Record<ReportStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    FOUND: 'bg-blue-100 text-blue-700',
    EXPIRED: 'bg-gray-100 text-gray-500',
    SUSPENDED: 'bg-red-100 text-red-600',
  };
  const labels: Record<ReportStatus, string> = {
    ACTIVE: t('detail.statusActive'),
    FOUND: t('detail.statusFound'),
    EXPIRED: t('detail.statusExpired'),
    SUSPENDED: t('detail.statusSuspended'),
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function SubjectBadge({ type }: { type: Report['subjectType'] }) {
  const { t } = useTranslation();
  const styles = {
    PERSON: 'bg-purple-100 text-purple-700',
    DOG: 'bg-yellow-100 text-yellow-700',
    CAT: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
      {t(`subjectType.${type}`)}
    </span>
  );
}

export default function MyReportsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchReports = (p: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('limit', '12');

    api.get<ReportListResponse>(`/reports/mine?${params}`)
      .then((data) => {
        setReports(data.items ?? data.reports ?? []);
        setTotalPages(data.totalPages);
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReports(page);
  }, [page]);

  const handleDelete = async (report: Report) => {
    if (!confirm(t('myReports.deleteConfirm', { name: report.name }))) return;
    setActionLoading(report.id);
    try {
      await api.delete(`/reports/${report.id}`);
      fetchReports(page);
    } catch {
      alert(t('myReports.deleteError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (report: Report) => {
    const nextStatus: ReportStatus = report.status === 'ACTIVE' ? 'FOUND' : 'ACTIVE';
    setActionLoading(report.id + '-status');
    try {
      await api.patch(`/reports/${report.id}/status`, { status: nextStatus });
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r))
      );
    } catch {
      alert(t('myReports.statusError'));
    } finally {
      setActionLoading(null);
    }
  };

  const primaryPhoto = (report: Report) =>
    report.photos.find((p) => p.isPrimary) ?? report.photos[0] ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('myReports.title')}</h1>
        <Link
          to="/reports/new"
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {t('nav.newReport')}
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">{t('myReports.empty')}</p>
          <Link
            to="/reports/new"
            className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {t('nav.newReport')}
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {reports.map((report) => {
              const photo = primaryPhoto(report);
              const isDeleting = actionLoading === report.id;
              const isTogglingStatus = actionLoading === report.id + '-status';
              const isBusy = isDeleting || isTogglingStatus;

              return (
                <li
                  key={report.id}
                  className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                    {photo ? (
                      <img
                        src={photo.thumbnailUrl ?? photo.photoUrl}
                        alt={t('card.photoAlt', { name: report.name, type: t(`subjectType.${report.subjectType}`) })}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                        {t('card.noPhoto')}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{report.name}</span>
                      <SubjectBadge type={report.subjectType} />
                      <StatusBadge status={report.status} />
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {report.lastSeenAddress}
                      {report.createdAt && (
                        <span className="ml-2">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Toggle ACTIVE / FOUND (only for these two statuses) */}
                    {(report.status === 'ACTIVE' || report.status === 'FOUND') && (
                      <button
                        type="button"
                        onClick={() => { void handleToggleStatus(report); }}
                        disabled={isBusy}
                        title={report.status === 'ACTIVE' ? t('myReports.markFound') : t('myReports.markActive')}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                          report.status === 'FOUND'
                            ? 'text-blue-500 hover:bg-blue-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => { void navigate(`/reports/${report.id}/edit`); }}
                      disabled={isBusy}
                      title={t('myReports.edit')}
                      className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => { void handleDelete(report); }}
                      disabled={isBusy}
                      title={t('myReports.delete')}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {isDeleting ? (
                        <span className="w-4 h-4 block border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
              >
                {t('browse.prev')}
              </button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
              >
                {t('browse.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
