import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Clock, ChevronRight, PersonStanding, Dog, Cat } from 'lucide-react';
import { api } from '../api/client';
import type { ReportListResponse, Report } from '../api/client';
import { formatTimeAgo, getSubjectTypeLabel } from '@findthem/shared';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const DAY_MS = 24 * 60 * 60 * 1000;

function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < DAY_MS;
}

const ICON_CONFIG = {
  PERSON: { Icon: PersonStanding, className: 'bg-blue-100 text-blue-500' },
  DOG:    { Icon: Dog,            className: 'bg-amber-100 text-amber-500' },
  CAT:    { Icon: Cat,            className: 'bg-rose-100 text-rose-500' },
} as const;

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReports = useCallback(() => {
    setLoading(true);
    setError('');
    return api
      .get<ReportListResponse>('/reports?limit=50&status=ACTIVE')
      .then((res) => { setReports(res.items); })
      .catch((err: unknown) => {
        const code = err instanceof Error ? err.message : '';
        setError(t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
      })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  usePullToRefresh(fetchReports);

  return (
    <div className="max-w-lg mx-auto px-4 py-4">
      <h1 className="text-lg font-bold mb-4">알림</h1>

      {loading && (
        <p className="text-center text-gray-400 py-12">불러오는 중...</p>
      )}

      {error && (
        <p className="text-center text-red-500 py-12">{error}</p>
      )}

      {!loading && !error && reports.length === 0 && (
        <p className="text-center text-gray-400 py-12">등록된 신고가 없습니다.</p>
      )}

      <ul className="divide-y divide-gray-100">
        {reports.map((report) => {
          const config = ICON_CONFIG[report.subjectType as keyof typeof ICON_CONFIG]
            ?? ICON_CONFIG.PERSON;
          const { Icon } = config;

          return (
            <li key={report.id}>
              <Link
                to={`/reports/${report.id}`}
                className="flex items-start gap-3 py-3 -mx-4 px-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${config.className}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isNew(report.createdAt) && (
                      <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full leading-none">NEW</span>
                    )}
                    <span className="text-xs text-indigo-600 font-medium">
                      {getSubjectTypeLabel(report.subjectType, 'ko')} 신고
                    </span>
                  </div>

                  <p className="font-semibold text-gray-900 truncate">{report.name}</p>

                  <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{report.features}</p>

                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[140px]">{report.lastSeenAddress}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(report.createdAt)}
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-2" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
