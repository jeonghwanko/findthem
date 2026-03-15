import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ReportDetail, type Sighting, type SightingListResponse } from '../api/client';
import ShareButton from '../components/ShareButton';

const STATUS_MAP: Record<string, string> = {
  ACTIVE: 'statusActive',
  FOUND: 'statusFound',
  EXPIRED: 'statusExpired',
  SUSPENDED: 'statusSuspended',
};

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
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
      .catch(() => setLoading(false))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center py-20 text-gray-400">{t('loading')}</div>;
  }

  if (!report) {
    return <div className="text-center py-20 text-gray-400">{t('detail.notFound')}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 상태 배지 + 공유 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
            {t(`subjectType.${report.subjectType}`)}
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
            {t(`detail.${STATUS_MAP[report.status]}`)}
          </span>
        </div>
        <ShareButton
          title={`[FindThem] ${report.name}`}
          description={report.features}
          imageUrl={report.photos[0]?.photoUrl}
        />
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
        <h2 className="font-semibold text-lg mb-4">{t('detail.detailInfo')}</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {report.species && (
            <>
              <dt className="text-gray-500">{t('detail.species')}</dt>
              <dd className="text-gray-900">{report.species}</dd>
            </>
          )}
          {report.gender && (
            <>
              <dt className="text-gray-500">{t('detail.gender')}</dt>
              <dd className="text-gray-900">
                {report.gender === 'MALE' ? t('detail.genderMale') : report.gender === 'FEMALE' ? t('detail.genderFemale') : t('detail.genderUnknown')}
              </dd>
            </>
          )}
          {report.age && (
            <>
              <dt className="text-gray-500">{t('detail.age')}</dt>
              <dd className="text-gray-900">{report.age}</dd>
            </>
          )}
          {report.color && (
            <>
              <dt className="text-gray-500">{t('detail.color')}</dt>
              <dd className="text-gray-900">{report.color}</dd>
            </>
          )}
          <dt className="text-gray-500">{t('detail.lastSeen')}</dt>
          <dd className="text-gray-900">
            {new Date(report.lastSeenAt).toLocaleString(i18n.language)}
          </dd>
          <dt className="text-gray-500">{t('detail.lastSeenPlace')}</dt>
          <dd className="text-gray-900">{report.lastSeenAddress}</dd>
        </dl>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-sm text-gray-500 mb-1">{t('detail.features')}</h3>
          <p className="text-gray-900">{report.features}</p>
        </div>
        {report.clothingDesc && (
          <div className="mt-3">
            <h3 className="text-sm text-gray-500 mb-1">{t('detail.clothing')}</h3>
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
        <h2 className="font-semibold text-lg mb-2">{t('detail.contact')}</h2>
        <p className="text-gray-700">{report.contactName}</p>
        <a
          href={`tel:${report.contactPhone}`}
          className="inline-block mt-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          📞 {report.contactPhone}
        </a>
      </div>

      {/* 제보 버튼 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <Link
          to={`/sightings/new?reportId=${report.id}`}
          className="flex-1 text-center bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-xl font-semibold text-lg transition-colors"
        >
          {t('detail.sightedThis', { type: t(`subjectType.${report.subjectType}`) })}
        </Link>
        <button
          onClick={() => {
            const btn = document.querySelector<HTMLButtonElement>('[aria-label="AI 제보 도우미 열기"]');
            btn?.click();
          }}
          className="flex-1 text-center bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-semibold text-lg transition-colors"
        >
          🤖 AI로 제보하기
        </button>
      </div>

      {/* 제보 목록 */}
      {sightings.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-4">
            {t('detail.sightingCount', { count: sightings.length })}
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
                      📍 {s.address} · {new Date(s.sightedAt).toLocaleString(i18n.language)}
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
