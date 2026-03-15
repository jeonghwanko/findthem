import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Megaphone, MessageSquare, ScanFace } from 'lucide-react';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import type { SubjectType } from '@findthem/shared';

const FILTERS: SubjectType[] = ['DOG', 'CAT', 'PERSON'];

interface Stats {
  total: number;
  found: number;
}

export default function HomePage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SubjectType>('DOG');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ReportListResponse>('/reports?limit=1'),
      api.get<ReportListResponse>('/reports?status=FOUND&limit=1'),
    ]).then(([all, found]) => {
      setStats({ total: all.total ?? 0, found: found.total ?? 0 });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.get<ReportListResponse>(`/reports?limit=8&type=${filter}`)
      // data.reports는 deprecated — items로 마이그레이션 완료 후 제거
      .then((data) => {
        if (!ignore) setReports(data.items ?? (data as { reports: Report[] }).reports ?? []);
      })
      .catch(() => { if (!ignore) setReports([]); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [filter]);

  const recoveryRate = stats && stats.total > 0
    ? Math.round((stats.found / stats.total) * 100)
    : null;

  return (
    <div className="bg-white">
      {/* Hero */}
      <section
        className="border-b border-gray-100 py-20 px-4 relative overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, #c7d2fe 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          backgroundColor: '#f8fafc',
        }}
      >
        {/* 배경 그라디언트 페이드 */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-transparent to-white/80 pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative">
          <span className="inline-block bg-primary-50 text-primary-700 text-sm font-medium px-3 py-1 rounded-full mb-5">
            {t('home.heroBadge')}
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-5 leading-tight">
            {t('home.heroTitle')}
          </h1>
          <p className="text-gray-500 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            {t('home.heroDesc')}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              to="/reports/new"
              className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-semibold text-base transition-colors shadow-sm"
            >
              {t('home.newReport')}
            </Link>
            <Link
              to="/browse"
              className="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-xl font-semibold text-base transition-colors"
            >
              {t('home.submitSighting')}
            </Link>
          </div>

          {/* Stats strip */}
          {stats && (
            <div className="inline-flex items-center mt-12 bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl px-2 py-1 shadow-sm divide-x divide-gray-100">
              <div className="px-6 py-3 text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {stats.total.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t('home.statTotal')}</p>
              </div>
              <div className="px-6 py-3 text-center">
                <p className="text-2xl font-bold text-primary-600 tabular-nums">
                  {stats.found.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t('home.statFound')}</p>
              </div>
              {recoveryRate !== null && (
                <div className="px-6 py-3 text-center">
                  <p className="text-2xl font-bold text-green-600 tabular-nums">
                    {recoveryRate}%
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('home.statRate')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-8 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all text-center">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <Megaphone className="w-6 h-6 text-blue-500" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.featurePromo')}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t('home.featurePromoDesc')}
            </p>
          </div>
          <div className="p-8 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all text-center">
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <MessageSquare className="w-6 h-6 text-green-500" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.featureChatbot')}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t('home.featureChatbotDesc')}
            </p>
          </div>
          <div className="p-8 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all text-center">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <ScanFace className="w-6 h-6 text-purple-500" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.featureMatching')}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t('home.featureMatchingDesc')}
            </p>
          </div>
        </div>
      </section>

      {/* 최근 실종 신고 */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">{t('home.recentReports')}</h2>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    filter === f
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t(`subjectType.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <Link
            to="/browse"
            className="text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 font-medium px-4 py-1.5 rounded-lg transition-colors shrink-0"
          >
            {t('home.viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status" aria-live="polite" aria-busy="true" aria-label={t('loading')}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-gray-100" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {t('home.noReports')}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
