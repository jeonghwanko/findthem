import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, CheckCircle, MapPin, Camera } from 'lucide-react';
import { api, type Report, type ReportListResponse, type ReportStatus, type Sighting, type SightingListResponse } from '../api/client';
import { formatTimeAgo, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@findthem/shared';

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

type Tab = 'reports' | 'sightings';

export default function MyReportsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = SUPPORTED_LOCALES.find(l => i18n.language === l || i18n.language.startsWith(`${l}-`) || (l === 'zh-TW' && i18n.language.startsWith('zh'))) ?? DEFAULT_LOCALE;

  const [tab, setTab] = useState<Tab>('reports');

  // Reports state
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Sightings state
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [sightingsLoading, setSightingsLoading] = useState(true);
  const [sightingsPage, setSightingsPage] = useState(1);
  const [sightingsTotalPages, setSightingsTotalPages] = useState(1);

  // Fetch reports
  useEffect(() => {
    if (tab !== 'reports') return;
    setReportsLoading(true);
    api.get<ReportListResponse>(`/reports/mine?page=${reportsPage}&limit=12`)
      .then((data) => {
        setReports(data.items ?? data.reports ?? []);
        setReportsTotalPages(data.totalPages);
      })
      .catch(() => setReports([]))
      .finally(() => setReportsLoading(false));
  }, [tab, reportsPage]);

  // Fetch sightings
  useEffect(() => {
    if (tab !== 'sightings') return;
    setSightingsLoading(true);
    api.get<SightingListResponse>(`/sightings/mine?page=${sightingsPage}&limit=12`)
      .then((data) => {
        setSightings(data.sightings ?? []);
        setSightingsTotalPages(data.totalPages);
      })
      .catch(() => setSightings([]))
      .finally(() => setSightingsLoading(false));
  }, [tab, sightingsPage]);

  const handleDelete = async (report: Report) => {
    if (!confirm(t('myReports.deleteConfirm', { name: report.name }))) return;
    setActionLoading(report.id);
    try {
      await api.delete(`/reports/${report.id}`);
      setReportsPage(1);
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

  const loading = tab === 'reports' ? reportsLoading : sightingsLoading;
  const page = tab === 'reports' ? reportsPage : sightingsPage;
  const totalPages = tab === 'reports' ? reportsTotalPages : sightingsTotalPages;
  const setPage = tab === 'reports' ? setReportsPage : setSightingsPage;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('myReports.title')}</h1>
        <Link
          to="/sightings/new"
          className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-[0_3px_0_0_#c2410c] hover:translate-y-[1px] hover:shadow-[0_2px_0_0_#c2410c] active:translate-y-[3px] active:shadow-none transition-all"
        >
          {t('nav.newSighting')}
        </Link>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        <button
          onClick={() => setTab('reports')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'reports' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {t('myReports.tabReports')}
        </button>
        <button
          onClick={() => setTab('sightings')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'sightings' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {t('myReports.tabSightings')}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tab === 'reports' && reports.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">{t('myReports.empty')}</p>
          <Link
            to="/reports/new"
            className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {t('nav.newReport')}
          </Link>
        </div>
      ) : tab === 'sightings' && sightings.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 mb-4">{t('myReports.emptySightings')}</p>
          <Link
            to="/sightings/new"
            className="inline-block bg-gradient-to-r from-orange-500 to-rose-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {t('nav.newSighting')}
          </Link>
        </div>
      ) : (
        <>
          {/* 신고 목록 */}
          {tab === 'reports' && (
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
                    <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                      {photo ? (
                        <img src={photo.thumbnailUrl ?? photo.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300"><Camera className="w-5 h-5" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{report.name}</span>
                        <SubjectBadge type={report.subjectType} />
                        <StatusBadge status={report.status} />
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {report.lastSeenAddress}
                        <span className="ml-2">{new Date(report.createdAt).toLocaleDateString()}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(report.status === 'ACTIVE' || report.status === 'FOUND') && (
                        <button type="button" onClick={() => { void handleToggleStatus(report); }} disabled={isBusy}
                          title={report.status === 'ACTIVE' ? t('myReports.markFound') : t('myReports.markActive')}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${report.status === 'FOUND' ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => { void navigate(`/reports/${report.id}/edit`); }} disabled={isBusy}
                        title={t('myReports.edit')} className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => { void handleDelete(report); }} disabled={isBusy}
                        title={t('myReports.delete')} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                        {isDeleting ? <span className="w-4 h-4 block border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 제보 목록 */}
          {tab === 'sightings' && (
            <ul className="space-y-3">
              {sightings.map((sighting) => {
                const photo = sighting.photos?.[0];
                return (
                  <li
                    key={sighting.id}
                    onClick={() => sighting.reportId && navigate(`/reports/${sighting.reportId}`)}
                    className={`flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm ${sighting.reportId ? 'cursor-pointer hover:border-primary-300' : ''}`}
                  >
                    <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                      {photo ? (
                        <img src={photo.thumbnailUrl ?? photo.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300"><Camera className="w-5 h-5" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">
                          {sighting.description || t('myReports.sightingNoDesc')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {sighting.address}
                        <span className="ml-2">{formatTimeAgo(sighting.createdAt, locale)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50">{t('browse.prev')}</button>
              <span className="text-sm text-gray-600">{page} / {totalPages}</span>
              <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50">{t('browse.next')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
