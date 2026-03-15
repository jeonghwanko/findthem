import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';

export default function BrowsePage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('DOG');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const TYPES = [
    { value: 'DOG', label: t('subjectType.DOG') },
    { value: 'CAT', label: t('subjectType.CAT') },
    { value: 'PERSON', label: t('subjectType.PERSON') },
  ];

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '12');
    params.set('type', type);
    if (search) params.set('q', search);

    api.get<ReportListResponse>(`/reports?${params}`)
      .then((data) => {
        setReports(data.reports);
        setTotalPages(data.totalPages);
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [type, page, search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('browse.title')}</h1>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {TYPES.map((item) => (
            <button
              key={item.value}
              onClick={() => { setType(item.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                type === item.value
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('browse.searchPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          />
        </form>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">{t('loading')}</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {t('browse.noResults')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>

          {/* 페이지네이션 */}
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
