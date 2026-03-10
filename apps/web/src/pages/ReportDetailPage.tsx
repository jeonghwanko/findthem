import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ReportDetail, Sighting, SightingListResponse } from '../api/client';
import { SUBJECT_TYPE_LABELS } from '@findthem/shared';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '찾는 중',
  FOUND: '찾았습니다',
  EXPIRED: '만료',
  SUSPENDED: '중지',
};

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<ReportDetail>(`/reports/${id}`),
      api.get<SightingListResponse>(`/reports/${id}/sightings`),
    ])
      .then(([r, s]) => {
        setReport(r);
        setSightings(s.sightings);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center py-20 text-gray-400">로딩 중...</div>;
  }

  if (!report) {
    return <div className="text-center py-20 text-gray-400">신고를 찾을 수 없습니다</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 상태 배지 */}
      <div className="flex items-center gap-3 mb-4">
        <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
          {SUBJECT_TYPE_LABELS[report.subjectType]}
        </span>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            report.status === 'ACTIVE'
              ? 'bg-red-100 text-red-700'
              : report.status === 'FOUND'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {STATUS_LABELS[report.status]}
        </span>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">{report.name}</h1>

      {/* 사진 갤러리 */}
      {report.photos.length > 0 && (
        <div className="mb-6">
          <div className="aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden mb-3">
            <img
              src={report.photos[selectedPhoto]?.photoUrl}
              alt={report.name}
              className="w-full h-full object-contain"
            />
          </div>
          {report.photos.length > 1 && (
            <div className="flex gap-2">
              {report.photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(i)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${
                    i === selectedPhoto ? 'border-primary-500' : 'border-transparent'
                  }`}
                >
                  <img
                    src={photo.thumbnailUrl || photo.photoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 상세 정보 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">상세 정보</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {report.species && (
            <>
              <dt className="text-gray-500">품종</dt>
              <dd className="text-gray-900">{report.species}</dd>
            </>
          )}
          {report.gender && (
            <>
              <dt className="text-gray-500">성별</dt>
              <dd className="text-gray-900">
                {report.gender === 'MALE' ? '수컷/남성' : report.gender === 'FEMALE' ? '암컷/여성' : '모름'}
              </dd>
            </>
          )}
          {report.age && (
            <>
              <dt className="text-gray-500">나이</dt>
              <dd className="text-gray-900">{report.age}</dd>
            </>
          )}
          {report.color && (
            <>
              <dt className="text-gray-500">색상</dt>
              <dd className="text-gray-900">{report.color}</dd>
            </>
          )}
          <dt className="text-gray-500">마지막 목격</dt>
          <dd className="text-gray-900">
            {new Date(report.lastSeenAt).toLocaleString('ko-KR')}
          </dd>
          <dt className="text-gray-500">목격 장소</dt>
          <dd className="text-gray-900">{report.lastSeenAddress}</dd>
        </dl>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-sm text-gray-500 mb-1">특징</h3>
          <p className="text-gray-900">{report.features}</p>
        </div>
        {report.clothingDesc && (
          <div className="mt-3">
            <h3 className="text-sm text-gray-500 mb-1">의상</h3>
            <p className="text-gray-900">{report.clothingDesc}</p>
          </div>
        )}
        {report.reward && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-accent-600 font-medium">💰 {report.reward}</p>
          </div>
        )}
      </div>

      {/* 연락처 */}
      <div className="bg-primary-50 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-lg mb-2">연락처</h2>
        <p className="text-gray-700">{report.contactName}</p>
        <a
          href={`tel:${report.contactPhone}`}
          className="inline-block mt-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          📞 {report.contactPhone}
        </a>
      </div>

      {/* 제보 버튼 */}
      <Link
        to={`/sightings/new?reportId=${report.id}`}
        className="block w-full text-center bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-xl font-semibold text-lg transition-colors mb-8"
      >
        이 {SUBJECT_TYPE_LABELS[report.subjectType]}을(를) 목격했습니다
      </Link>

      {/* 제보 목록 */}
      {sightings.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-4">
            제보 {sightings.length}건
          </h2>
          <div className="space-y-4">
            {sightings.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex gap-3">
                  {s.photos[0] && (
                    <img
                      src={s.photos[0].thumbnailUrl || s.photos[0].photoUrl}
                      alt=""
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div>
                    <p className="text-gray-900">{s.description}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      📍 {s.address} · {new Date(s.sightedAt).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
