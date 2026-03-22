import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin, Clock } from 'lucide-react';
import type { Report } from '../api/client';
import { formatTimeAgo, SUBJECT_TYPE_LABELS, type SubjectType } from '@findthem/shared';
import { assetSrc } from '../utils/webOrigin';

const TYPE_BADGE: Record<SubjectType, { bg: string; text: string; dot: string }> = {
  PERSON: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-400' },
  DOG: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  CAT: { bg: 'bg-violet-50', text: 'text-violet-600', dot: 'bg-violet-400' },
};

const SUBJECT_LABELS = SUBJECT_TYPE_LABELS['ko'];

interface ReportCardProps {
  report: Report;
}

export default function ReportCard({ report }: ReportCardProps) {
  const { t } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const primaryPhoto = report.photos?.[0];
  const timeAgo = formatTimeAgo(report.createdAt, 'ko');
  const badge = TYPE_BADGE[report.subjectType] ?? TYPE_BADGE.PERSON;
  const subjectLabel = SUBJECT_LABELS[report.subjectType] ?? report.subjectType;
  // 외부 수집 데이터는 name이 숫자 ID인 경우가 있음 — 대상 유형 라벨로 대체
  const displayName = /^\d{8,}$/.test(report.name) ? subjectLabel : report.name;

  return (
    <Link
      to={`/reports/${report.id}`}
      className="group block bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-200 overflow-hidden"
    >
      {/* 이미지 */}
      <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
        {primaryPhoto && !imgError ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse" />}
            <img
              src={assetSrc(primaryPhoto.thumbnailUrl || primaryPhoto.photoUrl)}
              alt={`${displayName} - ${subjectLabel}`}
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300" role="img" aria-label={t('browse.noPhoto')}>
            <Camera className="w-8 h-8" aria-hidden="true" />
          </div>
        )}

        {/* 타입 배지 */}
        <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm ${badge.bg} ${badge.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
          {subjectLabel}
        </span>

        {/* 제보 수 배지 */}
        {report._count && report._count.sightings > 0 && (
          <span className="absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-sm">
            {t('browse.sightingCount', { count: report._count.sightings })}
          </span>
        )}

        {/* FOUND 오버레이 */}
        {report.status === 'FOUND' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-white text-gray-900 text-sm font-bold px-4 py-1.5 rounded-full shadow-md">
              {t('browse.found')}
            </span>
          </div>
        )}
      </div>

      {/* 텍스트 */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate text-sm leading-snug">{displayName}</h3>
        <p className="text-xs text-gray-400 mt-1.5 truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0 text-gray-300" aria-hidden="true" />
          <span className="truncate">{report.lastSeenAddress}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0 text-gray-300" aria-hidden="true" />
          <span>{timeAgo}</span>
        </p>
      </div>
    </Link>
  );
}
