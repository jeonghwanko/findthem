import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { Camera, MapPin, Clock, User, FileText, ArrowRight, Bot, Loader2, Trash2 } from 'lucide-react';
import type { SightingDetail, SightingPhotoAnalysis } from '@findthem/shared';
import { formatTimeAgo } from '@findthem/shared';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import ShareButton from '../components/ShareButton';
import KakaoMap, { type MapMarker } from '../components/KakaoMap';
import { assetSrc } from '../utils/webOrigin';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ANALYZED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-gray-100 text-gray-500',
};

// STATUS_LABELS, MATCH_STATUS_LABELS → t('sighting.status.*') / t('sighting.matchStatus.*') 사용

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function SightingDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sighting, setSighting] = useState<SightingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  usePullToRefresh(() => { setRefreshKey((k) => k + 1); });

  useEffect(() => {
    if (!id) return;
    api
      .get<SightingDetail>(`/sightings/${id}`)
      .then((s) => setSighting(s))
      .catch(() => setLoading(false))
      .finally(() => setLoading(false));
  }, [id, refreshKey]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="aspect-[4/3] bg-gray-200 rounded-xl mb-6" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!sighting) {
    return <div className="text-center py-20 text-gray-400">제보를 찾을 수 없습니다</div>;
  }

  // 삭제 권한: 본인 제보(로그인) 또는 비회원 제보(비밀번호)
  const isOwner = user && sighting.userId === user.id;
  const isGuestSighting = !sighting.userId;
  const canDelete = isOwner || isGuestSighting;

  const handleDelete = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      const body = isGuestSighting ? { editPassword: deletePassword } : undefined;
      await api.delete(`/sightings/${id}`, body);
      navigate('/browse', { replace: true });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      setDeleteError(t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    } finally {
      setDeleting(false);
      deletingRef.current = false;
    }
  };

  const report = sighting.report;
  const matches = sighting.matches ?? [];
  const hasLocation = sighting.lat != null && sighting.lng != null;

  // 카카오맵 마커
  const mapMarkers: MapMarker[] = [];
  if (hasLocation) {
    mapMarkers.push({
      lat: sighting.lat!,
      lng: sighting.lng!,
      title: '목격 위치',
      infoContent: `<div style="padding:4px 8px;font-size:12px;white-space:nowrap">📍 ${esc('목격 위치')}</div>`,
    });
  }
  if (report?.lastSeenLat != null && report.lastSeenLng != null) {
    mapMarkers.push({
      lat: report.lastSeenLat,
      lng: report.lastSeenLng,
      title: report.name,
      infoContent: `<div style="padding:4px 8px;font-size:12px;white-space:nowrap">🔴 ${esc(report.name)}</div>`,
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 헤더: 상태 배지 + 공유 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
            목격 제보
          </span>
          {sighting.status && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[sighting.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {t(`sighting.status.${sighting.status}`, { defaultValue: sighting.status })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton
            title={`[FindThem] 목격 제보`}
            description={sighting.description || sighting.address}
            imageUrl={sighting.photos[0]?.photoUrl}
          />
          {canDelete && (
            <button
              type="button"
              onClick={() => { setShowDeleteModal(true); setDeleteError(''); setDeletePassword(''); }}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              title={t('sighting.delete', { defaultValue: '삭제' })}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 제목 */}
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {sighting.description || '(설명 없음)'}
      </h1>

      {/* 사진 갤러리 */}
      {sighting.photos.length > 0 && (
        <div className="mb-6">
          <div className="aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden mb-3 relative">
            <img
              src={assetSrc(sighting.photos[selectedPhoto]?.photoUrl)}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                e.currentTarget.parentElement?.querySelector('.img-fallback')?.classList.remove('hidden');
              }}
            />
            <div className="img-fallback hidden absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-300">
              <Camera className="w-12 h-12" />
            </div>
          </div>
          {sighting.photos.length > 1 && (
            <div className="flex gap-2">
              {sighting.photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setSelectedPhoto(i)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 bg-gray-100 ${
                    i === selectedPhoto ? 'border-primary-500' : 'border-transparent'
                  }`}
                >
                  <img
                    src={assetSrc(photo.thumbnailUrl || photo.photoUrl)}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI 분석 결과 */}
      {sighting.status === 'PENDING' ? (
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 mb-6">
          <div className="flex items-center gap-2 text-yellow-700">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-semibold">AI 분석 중...</span>
          </div>
          <p className="text-sm text-yellow-600 mt-2">사진을 분석하고 있습니다. 잠시만 기다려 주세요.</p>
        </div>
      ) : (() => {
        const analysis = sighting.photos.find((p) => p.aiAnalysis)?.aiAnalysis as SightingPhotoAnalysis | undefined;
        if (!analysis) return null;
        return (
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-lg text-blue-900">AI 분석 결과</h2>
            </div>
            {analysis.description && (
              <p className="text-sm text-blue-800 mb-4">{analysis.description}</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {analysis.species && (
                <>
                  <dt className="text-blue-600">품종</dt>
                  <dd className="text-blue-900">{analysis.species}</dd>
                </>
              )}
              {analysis.color && (
                <>
                  <dt className="text-blue-600">색상</dt>
                  <dd className="text-blue-900">{analysis.color}</dd>
                </>
              )}
              {analysis.size && (
                <>
                  <dt className="text-blue-600">크기</dt>
                  <dd className="text-blue-900">{analysis.size}</dd>
                </>
              )}
              {analysis.estimatedAge && (
                <>
                  <dt className="text-blue-600">추정 나이</dt>
                  <dd className="text-blue-900">{analysis.estimatedAge}</dd>
                </>
              )}
              {analysis.collarDetected != null && (
                <>
                  <dt className="text-blue-600">목줄</dt>
                  <dd className="text-blue-900">
                    {analysis.collarDetected
                      ? analysis.collarDescription || '있음'
                      : '없음'}
                  </dd>
                </>
              )}
              {analysis.healthCondition && (
                <>
                  <dt className="text-blue-600">건강 상태</dt>
                  <dd className="text-blue-900">{analysis.healthCondition}</dd>
                </>
              )}
              {analysis.furCondition && (
                <>
                  <dt className="text-blue-600">털 상태</dt>
                  <dd className="text-blue-900">{analysis.furCondition}</dd>
                </>
              )}
              {analysis.accessories && (
                <>
                  <dt className="text-blue-600">액세서리</dt>
                  <dd className="text-blue-900">{analysis.accessories}</dd>
                </>
              )}
            </dl>
            {analysis.distinctiveFeatures && analysis.distinctiveFeatures.length > 0 && (
              <div className="mt-3">
                <dt className="text-sm text-blue-600 mb-1">특징</dt>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.distinctiveFeatures.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 제보 정보 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">제보 정보</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <dt className="text-gray-500 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />목격 장소
          </dt>
          <dd className="text-gray-900">{sighting.address}</dd>

          <dt className="text-gray-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />목격 시각
          </dt>
          <dd className="text-gray-900">
            {new Date(sighting.sightedAt).toLocaleString('ko-KR')}
          </dd>

          <dt className="text-gray-500 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />제보 시각
          </dt>
          <dd className="text-gray-900">{formatTimeAgo(sighting.createdAt, 'ko')}</dd>

          {sighting.tipsterName && (
            <>
              <dt className="text-gray-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />제보자
              </dt>
              <dd className="text-gray-900">{sighting.tipsterName}</dd>
            </>
          )}

          {sighting.tipsterPhone && (
            <>
              <dt className="text-gray-500">연락처</dt>
              <dd className="text-gray-900">
                <a href={`tel:${sighting.tipsterPhone}`} className="text-primary-600 hover:underline">
                  {sighting.tipsterPhone}
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* 지도 */}
      {mapMarkers.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">지도</h2>
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <KakaoMap
              markers={mapMarkers}
              className="h-[300px]"
            />
          </div>
        </div>
      )}

      {/* 연결된 신고 */}
      {report && (
        <div className="bg-primary-50 rounded-xl border border-primary-100 p-5 mb-6">
          <h2 className="font-semibold text-sm text-primary-800 mb-3">연결된 신고</h2>
          <Link
            to={`/reports/${report.id}`}
            className="flex items-center gap-3 bg-white rounded-lg p-3 border border-primary-200 hover:border-primary-400 transition-colors"
          >
            {report.photos?.[0]?.thumbnailUrl ? (
              <img src={assetSrc(report.photos[0].thumbnailUrl)} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                <Camera className="w-5 h-5 text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{report.name}</p>
              <p className="text-xs text-gray-500">{report.lastSeenAddress}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary-400 shrink-0" />
          </Link>
        </div>
      )}

      {/* AI 매칭 결과 */}
      {matches.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">AI 매칭 결과</h2>
          <div className="space-y-3">
            {matches.map((m) => (
              <Link
                key={m.id}
                to={`/reports/${m.reportId}`}
                className="block p-3 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${m.confidence >= 0.8 ? 'text-green-600' : m.confidence >= 0.6 ? 'text-yellow-600' : 'text-gray-500'}`}>
                    유사도 {Math.round(m.confidence * 100)}%
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    m.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                    m.status === 'REJECTED' ? 'bg-gray-100 text-gray-500' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {t(`sighting.matchStatus.${m.status}`, { defaultValue: m.status })}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{m.aiReasoning}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('sighting.deleteTitle', { defaultValue: '제보 삭제' })}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('sighting.deleteConfirm', { defaultValue: '이 제보를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.' })}
            </p>

            {isGuestSighting && (
              <input
                type="password"
                placeholder={t('sighting.editPasswordPlaceholder', { defaultValue: '제보 시 입력한 비밀번호' })}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            )}

            {deleteError && (
              <p className="text-sm text-red-500 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel', { defaultValue: '취소' })}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || (isGuestSighting && !deletePassword)}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? t('common.processing', { defaultValue: '처리 중...' }) : t('common.delete', { defaultValue: '삭제' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
