import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Report } from '../api/client';
import { formatTimeAgo } from '@findthem/shared';

const TYPE_COLORS: Record<string, string> = {
  PERSON: 'bg-blue-100 text-blue-700',
  DOG: 'bg-amber-100 text-amber-700',
  CAT: 'bg-purple-100 text-purple-700',
};

interface ReportCardProps {
  report: Report;
}

export default function ReportCard({ report }: ReportCardProps) {
  const { t } = useTranslation();
  const primaryPhoto = report.photos?.[0];
  const timeAgo = formatTimeAgo(report.createdAt);

  return (
    <Link
      to={`/reports/${report.id}`}
      className="block bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden"
    >
      <div className="aspect-[4/3] bg-gray-100 relative">
        {primaryPhoto ? (
          <img
            src={primaryPhoto.thumbnailUrl || primaryPhoto.photoUrl}
            alt={report.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">
            📷
          </div>
        )}
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[report.subjectType]}`}
        >
          {t(`subjectType.${report.subjectType}`)}
        </span>
        {report.status === 'FOUND' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-lg font-bold">{t('card.found')}</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate">{report.name}</h3>
        <p className="text-sm text-gray-500 mt-1 truncate">
          📍 {report.lastSeenAddress}
        </p>
        <p className="text-sm text-gray-400 mt-1 line-clamp-2">{report.features}</p>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
          <span>{timeAgo}</span>
          {report._count && (
            <span>{t('card.sightingCount', { count: report._count.sightings })}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

