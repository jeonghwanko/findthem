import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { Search, Gamepad2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type Report, type ReportListResponse, type Sighting, type SightingListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import SightingCard from '../components/SightingCard';
import { ReportCardSkeleton } from '../components/Skeleton';

const BROWSE_PAGE_SIZE = 12;

const REGIONS = [
  '', '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

type ViewMode = 'all' | 'reports' | 'sightings';

export default function BrowsePage() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [reports, setReports] = useState<Report[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [phase, setPhase] = useState('');
  const [region, setRegion] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const abortRef = useRef<AbortController>(undefined);

  usePullToRefresh(() => { setPage(1); setRefreshKey((k) => k + 1); });

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
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(BROWSE_PAGE_SIZE));
    if (debouncedSearch) params.set('q', debouncedSearch);

    const fetchReports = () => {
      const rp = new URLSearchParams(params);
      if (type) rp.set('type', type);
      if (phase) rp.set('phase', phase);
      if (region) rp.set('region', region);
      return api.get<ReportListResponse>(`/reports?${rp}`, { signal: controller.signal });
    };

    const fetchSightings = () =>
      api.get<SightingListResponse>(`/sightings?${params}`, { signal: controller.signal });

    const handleError = (err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setReports([]);
      setSightings([]);
      const code = err instanceof Error ? err.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    };

    if (viewMode === 'reports') {
      fetchReports()
        .then((data) => {
          setReports(data.items ?? []);
          setSightings([]);
          setTotalPages(data.totalPages);
        })
        .catch(handleError)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (viewMode === 'sightings') {
      fetchSightings()
        .then((data) => {
          setSightings(data.items ?? []);
          setReports([]);
          setTotalPages(data.totalPages);
        })
        .catch(handleError)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else {
      // all — 신고 + 제보 병렬 로드
      Promise.all([fetchReports(), fetchSightings()])
        .then(([rData, sData]) => {
          setReports(rData.items ?? []);
          setSightings(sData.items ?? []);
          setTotalPages(Math.max(rData.totalPages, sData.totalPages));
        })
        .catch(handleError)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }

    return () => controller.abort();
  }, [viewMode, type, phase, region, page, debouncedSearch, refreshKey]);

  const setFilter = useCallback((setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  }, []);

  const handleViewChange = useCallback((v: ViewMode) => {
    setViewMode(v);
    setPage(1);
    // 제보 모드에서는 신고 전용 필터 리셋
    if (v === 'sightings') {
      setType('');
      setPhase('');
    }
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
  }

  // 전체 모드: 신고 + 제보를 createdAt 기준으로 합쳐서 표시
  const mergedItems = useMemo(() => {
    if (viewMode !== 'all') return [];
    const items: Array<{ kind: 'report'; data: Report } | { kind: 'sighting'; data: Sighting }> = [
      ...reports.map((r) => ({ kind: 'report' as const, data: r })),
      ...sightings.map((s) => ({ kind: 'sighting' as const, data: s })),
    ];
    return items.sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());
  }, [viewMode, reports, sightings]);

  const showTypeFilters = viewMode !== 'sightings';
  const showPhaseFilters = viewMode !== 'sightings';
  const isEmpty = viewMode === 'reports' ? reports.length === 0
    : viewMode === 'sightings' ? sightings.length === 0
    : mergedItems.length === 0;

  const VIEW_FILTERS = [
    { value: 'all' as ViewMode, label: t('browse.viewAll') },
    { value: 'reports' as ViewMode, label: t('browse.viewReports') },
    { value: 'sightings' as ViewMode, label: t('browse.viewSightings') },
  ];

  const TYPE_FILTERS = [
    { value: '', label: t('browse.typeAll') },
    { value: 'DOG', label: t('browse.typeDog') },
    { value: 'CAT', label: t('browse.typeCat') },
  ];

  const PHASE_FILTERS = [
    { value: '', label: t('browse.phaseAll') },
    { value: 'searching', label: t('browse.phaseSearching') },
    { value: 'sighting_received', label: t('browse.phaseSightingReceived') },
    { value: 'analysis_done', label: t('browse.phaseAnalysisDone') },
    { value: 'found', label: t('browse.phaseFound') },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-28">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">{t('browse.title')}</h1>
        <Link
          to="/game"
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-amber-900 font-semibold shadow-[0_4px_0_0_#b45309,0_6px_16px_rgba(180,83,9,0.3)] hover:shadow-[0_2px_0_0_#b45309,0_4px_10px_rgba(180,83,9,0.3)] hover:translate-y-[2px] active:shadow-none active:translate-y-[4px] transition-all duration-100 px-3.5 py-2"
        >
          <Gamepad2 className="w-4 h-4 drop-shadow-sm" aria-hidden="true" />
          <span className="text-xs">{t('browse.gameButton')}</span>
        </Link>
      </div>

      {/* 필터 영역 */}
      <div className="space-y-2.5 mb-5">
        {/* 뷰 + 종류 + 상태 — 한 줄에 묶기 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* 보기 모드 탭 */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
            {VIEW_FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => handleViewChange(item.value)}
                className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[36px] ${
                  viewMode === item.value
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 종류 필터 (제보 모드에서 숨김) */}
          {showTypeFilters && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-400 shrink-0">{t('browse.filterType')}</span>
              <div className="flex gap-1">
                {TYPE_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setFilter(setType, item.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                      type === item.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 상태 필터 (제보 모드에서 숨김) — 가로 스크롤 */}
        {showPhaseFilters && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-400 shrink-0">{t('browse.filterStatus')}</span>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {PHASE_FILTERS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFilter(setPhase, item.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
                    phase === item.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 지역 필터 — 가로 스크롤 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-400 shrink-0">{t('browse.filterRegion')}</span>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setFilter(setRegion, r)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
                  region === r
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r || t('browse.regionAll')}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('browse.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm text-gray-900 placeholder:text-gray-400 transition-shadow"
          />
        </form>
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: BROWSE_PAGE_SIZE }).map((_, i) => (
            <ReportCardSkeleton key={i} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">{t('browse.noResults')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {viewMode === 'reports' && reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
            {viewMode === 'sightings' && sightings.map((sighting) => (
              <SightingCard key={sighting.id} sighting={sighting} />
            ))}
            {viewMode === 'all' && mergedItems.map((item) =>
              item.kind === 'report'
                ? <ReportCard key={`r-${item.data.id}`} report={item.data} />
                : <SightingCard key={`s-${item.data.id}`} sighting={item.data} />
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                aria-label={t('browse.prev')}
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                {t('browse.prev')}
              </button>
              <span className="text-sm text-gray-500 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                aria-label={t('browse.next')}
              >
                {t('browse.next')}
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
