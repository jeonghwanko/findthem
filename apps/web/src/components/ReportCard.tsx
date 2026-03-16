import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin } from 'lucide-react';
import type { Report } from '../api/client';
import { formatTimeAgo, SUPPORTED_LOCALES, DEFAULT_LOCALE, type SubjectType } from '@findthem/shared';

const TYPE_BADGE: Record<SubjectType, { bg: string; text: string; dot: string }> = {
  PERSON: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-400' },
  DOG: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  CAT: { bg: 'bg-violet-50', text: 'text-violet-600', dot: 'bg-violet-400' },
};

interface ReportCardProps {
  report: Report;
}

export default function ReportCard({ report }: ReportCardProps) {
  const { t, i18n } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const primaryPhoto = report.photos?.[0];
  const locale = SUPPORTED_LOCALES.find(l => i18n.language === l || i18n.language.startsWith(`${l  }-`) || (l === 'zh-TW' && i18n.language.startsWith('zh'))) ?? DEFAULT_LOCALE;
  const timeAgo = formatTimeAgo(report.createdAt, locale);
  const badge = TYPE_BADGE[report.subjectType] ?? TYPE_BADGE.PERSON;
  // 외부 수집 데이터는 name이 숫자 ID인 경우가 있음 — 대상 유형 라벨로 대체
  const displayName = /^\d{8,}$/.test(report.name)
    ? t(`subjectType.${report.subjectType}`)
    : report.name;

  return (
    <Link
      to={`/reports/${report.id}`}
      className="group block bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
    >
      {/* 이미지 */}
      <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
        {primaryPhoto ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse" />}
            <img
              src={primaryPhoto.thumbnailUrl || primaryPhoto.photoUrl}
              alt={t('card.photoAlt', { name: displayName, type: t(`subjectType.${report.subjectType}`) })}
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${imgLoaded ? '' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300" role="img" aria-label={t('card.noPhoto')}>
            <Camera className="w-8 h-8" aria-hidden="true" />
          </div>
        )}

        {/* 타입 배지 */}
        <span className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
          {t(`subjectType.${report.subjectType}`)}
        </span>

        {/* FOUND 오버레이 */}
        {report.status === 'FOUND' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-white text-gray-900 text-sm font-bold px-4 py-1.5 rounded-full shadow-sm">
              {t('card.found')}
            </span>
          </div>
        )}
      </div>

      {/* 텍스트 */}
      <div className="p-3.5">
        <h3 className="font-semibold text-gray-900 truncate text-sm">{displayName}</h3>
        <p className="text-xs text-gray-400 mt-1 truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{report.lastSeenAddress}</span>
        </p>
        {report.features?.trim() && (
          <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">{report.features}</p>
        )}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100 text-xs text-gray-400">
          <span>{timeAgo}</span>
          {report._count && report._count.sightings > 0 && (
            <span className="text-primary-500 font-medium">
              {t('card.sightingCount', { count: report._count.sightings })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

