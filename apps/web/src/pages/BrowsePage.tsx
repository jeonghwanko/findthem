import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import { ReportCardSkeleton } from '../components/Skeleton';
import KakaoMap, { type MapMarker } from '../components/KakaoMap';

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function BrowsePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('DOG');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userCenter, setUserCenter] = useState<{ lat: number; lng: number } | null>(null);
  const geoFetched = useRef(false);

  // 지도 탭 첫 진입 시 현재 위치 요청
  useEffect(() => {
    if (viewMode !== 'map' || geoFetched.current) return;
    geoFetched.current = true;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* 거부 시 기본값 유지 */ },
      { timeout: 5000 },
    );
  }, [viewMode]);

  const TYPES = [
    { value: 'DOG', label: t('subjectType.DOG') },
    { value: 'CAT', label: t('subjectType.CAT') },
    { value: 'PERSON', label: t('subjectType.PERSON') },
  ];

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    // 지도 뷰는 한 번에 많이 로드 (페이지네이션 없음)
    params.set('page', viewMode === 'map' ? '1' : String(page));
    params.set('limit', viewMode === 'map' ? '50' : '12');
    params.set('type', type);
    if (search) params.set('q', search);

    api.get<ReportListResponse>(`/reports?${params}`)
      .then((data) => {
        setReports(data.items ?? data.reports ?? []);
        setTotalPages(data.totalPages);
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [type, page, search, viewMode]);

  const mapMarkers: MapMarker[] = reports
    .filter((r) => r.lastSeenLat !== null && r.lastSeenLat !== undefined && r.lastSeenLng !== null && r.lastSeenLng !== undefined)
    .map((r) => ({
      lat: r.lastSeenLat!,
      lng: r.lastSeenLng!,
      title: r.name,
      infoContent: `<div style="padding:4px 8px;font-size:13px"><strong>${esc(r.name)}</strong><br/>${esc(r.lastSeenAddress)}</div>`,
      onClick: () => navigate(`/reports/${r.id}`),
    }));

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('browse.title')}</h1>

      {/* 뷰 전환 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setViewMode('list')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('browse.viewList')}
        </button>
        <button
          onClick={() => setViewMode('map')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'map' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('browse.viewMap')}
        </button>
      </div>

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

      {/* 지도 뷰 */}
      {viewMode === 'map' && (
        <div className="mb-6">
          {!KAKAO_JS_KEY ? (
            <div className="h-[500px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
              {t('browse.mapKeyMissing')}
            </div>
          ) : loading ? (
            <div className="h-[500px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
              {t('loading')}
            </div>
          ) : (
            <>
              <KakaoMap
                markers={mapMarkers}
                center={userCenter ?? (mapMarkers.length > 0 ? undefined : DEFAULT_CENTER)}
                className="w-full h-[500px] rounded-xl"
              />
              {mapMarkers.length < reports.length && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {t('browse.mapNoCoords')}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {viewMode === 'list' && loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <ReportCardSkeleton key={i} />
          ))}
        </div>
      ) : viewMode === 'list' && reports.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {t('browse.noResults')}
        </div>
      ) : viewMode === 'list' ? (
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
      ) : null}
    </div>
  );
}
