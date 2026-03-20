import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Search, Gamepad2 } from 'lucide-react';
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
  const abortRef = useRef<AbortController>();

  const VIEW_FILTERS = useMemo(() => [
    { value: 'all' as ViewMode, label: t('browse.viewAll') },
    { value: 'reports' as ViewMode, label: t('browse.viewReports') },
    { value: 'sightings' as ViewMode, label: t('browse.viewSightings') },
  ], [t]);

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
      setError(t('browse.loadError'));
    };

    if (viewMode === 'reports') {
      fetchReports()
        .then((data) => {
          setReports(data.items ?? data.reports ?? []);
          setSightings([]);
          setTotalPages(data.totalPages);
        })
        .catch(handleError)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (viewMode === 'sightings') {
      fetchSightings()
        .then((data) => {
          setSightings(data.sightings ?? []);
          setReports([]);
          setTotalPages(data.totalPages);
        })
        .catch(handleError)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else {
      // all — 신고 + 제보 병렬 로드
      Promise.all([fetchReports(), fetchSightings()])
        .then(([rData, sData]) => {
          setReports(rData.items ?? rData.reports ?? []);
          setSightings(sData.sightings ?? []);
          setTotalPages(Math.max(rData.totalPages, sData.totalPages));
        })
        .catch(handleError)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }

    return () => controller.abort();
  }, [viewMode, type, phase, region, page, debouncedSearch, t]);

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('browse.title')}</h1>

      {/* 게임 후원 버튼 — 헤더 바로 아래 우측 고정 */}
      <Link
        to="/game"
        className="fixed right-4 top-[56px] z-30 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-amber-900 font-bold shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-150 px-3.5 py-2"
      >
        <Gamepad2 className="w-4 h-4 drop-shadow-sm" aria-hidden="true" />
        <span className="text-xs">{t('home.playToSponsor')}</span>
      </Link>

      {/* 필터 영역 */}
      <div className="space-y-3 mb-6">
        {/* 보기 필터 (신고/제보/전체) */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {VIEW_FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => handleViewChange(item.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === item.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 종류 + 상태 필터 (제보 모드에서는 숨김) */}
        {(showTypeFilters || showPhaseFilters) && (
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {showTypeFilters && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 shrink-0">{t('browse.filterType')}</span>
                <div className="flex gap-1">
                  {TYPE_FILTERS.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setFilter(setType, item.value)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        type === item.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showPhaseFilters && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 shrink-0">{t('browse.filterStatus')}</span>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {PHASE_FILTERS.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setFilter(setPhase, item.value)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                        phase === item.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 지역 필터 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 shrink-0">{t('browse.filterRegion')}</span>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setFilter(setRegion, r)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  region === r ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* 목록 */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: BROWSE_PAGE_SIZE }).map((_, i) => (
            <ReportCardSkeleton key={i} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 text-gray-400">
          {t('browse.noResults')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
              >
                {t('browse.prev')}
              </button>
              <span className="text-sm text-gray-600">{page} / {totalPages}</span>
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
