import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import { ReportCardSkeleton } from '../components/Skeleton';

export default function MyReportsPage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '12');

    api.get<ReportListResponse>(`/reports/mine?${params}`)
      .then((data) => {
        setReports(data.items ?? data.reports ?? []);
        setTotalPages(data.totalPages);
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('myReports.title')}</h1>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ReportCardSkeleton key={i} />
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>

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