import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import { ReportCardSkeleton } from '../components/Skeleton';

const BROWSE_PAGE_SIZE = 12;

const REGIONS = [
  '', '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

export default function BrowsePage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [phase, setPhase] = useState('');
  const [region, setRegion] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController>();

  const TYPE_FILTERS = useMemo(() => [
    { value: '', label: t('browse.all') },
    { value: 'DOG', label: t('subjectType.DOG') },
    { value: 'CAT', label: t('subjectType.CAT') },
  ], [t]);

  const PHASE_FILTERS = useMemo(() => [
    { value: '', label: t('browse.all') },
    { value: 'searching', label: t('browse.phaseSearching') },
    { value: 'sighting_received', label: t('browse.phaseSightingReceived') },
    { value: 'analysis_done', label: t('browse.phaseAnalysisDone') },
    { value: 'found', label: t('browse.phaseFound') },
  ], [t]);

  // 검색 debounce (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // API 호출
  useEffect(() => {
    // 이전 요청 취소
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(BROWSE_PAGE_SIZE));
    if (type) params.set('type', type);
    if (phase) params.set('phase', phase);
    if (region) params.set('region', region);
    if (debouncedSearch) params.set('q', debouncedSearch);

    setError('');
    api.get<ReportListResponse>(`/reports?${params}`, { signal: controller.signal })
      .then((data) => {
        setReports(data.items ?? data.reports ?? []);
        setTotalPages(data.totalPages);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setReports([]);
        setError(t('browse.loadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [type, phase, region, page, debouncedSearch]);

  const setFilter = useCallback((setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('browse.title')}</h1>

      {/* 필터 영역 */}
      <div className="space-y-3 mb-6">
        {/* 종류 + 상태 필터 */}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {/* 종류 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 shrink-0">{t('browse.filterType')}</span>
            <div className="flex gap-1">
              {TYPE_FILTERS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFilter(setType, item.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    type === item.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 shrink-0">{t('browse.filterStatus')}</span>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {PHASE_FILTERS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFilter(setPhase, item.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    phase === item.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 지역 필터 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 shrink-0">{t('browse.filterRegion')}</span>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setFilter(setRegion, r)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  region === r
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r || t('browse.all')}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('browse.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          />
        </form>
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-4">{error}</p>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: BROWSE_PAGE_SIZE }).map((_, i) => (
            <ReportCardSkeleton key={i} />
          ))}
        </div>
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
