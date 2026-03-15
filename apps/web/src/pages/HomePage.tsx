import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Megaphone, MessageSquare, ScanFace, ArrowRight, type LucideIcon } from 'lucide-react';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import type { SubjectType } from '@findthem/shared';

const FILTERS: SubjectType[] = ['DOG', 'CAT', 'PERSON'];

interface Feature {
  key: string;
  Icon: LucideIcon;
  tagCls: string;
  activeCls: string;
  iconCls: string;
  iconBg: string;
  panelGradient: string;
  panelBorder: string;
  titleKey: string;
  descKey: string;
}

const FEATURES: Feature[] = [
  {
    key: 'promo',
    Icon: Megaphone,
    tagCls: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200',
    activeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    iconCls: 'text-blue-500',
    iconBg: 'bg-blue-50',
    panelGradient: 'from-blue-50/70 to-white',
    panelBorder: 'border-blue-100',
    titleKey: 'home.featurePromo',
    descKey: 'home.featurePromoDesc',
  },
  {
    key: 'chatbot',
    Icon: MessageSquare,
    tagCls: 'hover:bg-green-50 hover:text-green-700 hover:border-green-200',
    activeCls: 'bg-green-50 text-green-700 border-green-200',
    iconCls: 'text-green-500',
    iconBg: 'bg-green-50',
    panelGradient: 'from-green-50/70 to-white',
    panelBorder: 'border-green-100',
    titleKey: 'home.featureChatbot',
    descKey: 'home.featureChatbotDesc',
  },
  {
    key: 'matching',
    Icon: ScanFace,
    tagCls: 'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200',
    activeCls: 'bg-purple-50 text-purple-700 border-purple-200',
    iconCls: 'text-purple-500',
    iconBg: 'bg-purple-50',
    panelGradient: 'from-purple-50/70 to-white',
    panelBorder: 'border-purple-100',
    titleKey: 'home.featureMatching',
    descKey: 'home.featureMatchingDesc',
  },
];

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
  const [activeFeature, setActiveFeature] = useState(FEATURES[0].key);

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
        className="border-b border-pink-100 py-20 px-4 relative overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, #f472b6 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          backgroundColor: '#fce7f3',
        }}
      >
        {/* 배경 그라디언트 페이드 */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-white/40 pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative">
          <span className="inline-block bg-pink-100 text-pink-700 text-sm font-medium px-3 py-1 rounded-full mb-5">
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
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-7 py-3.5 rounded-xl font-semibold text-base transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              {t('home.newReport')}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              to="/browse"
              className="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-7 py-3.5 rounded-xl font-semibold text-base transition-all hover:-translate-y-0.5"
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

      {/* 기능 소개 - 인디고 틴트 밴드 */}
      <div className="bg-gray-50 border-y border-gray-100 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* 태그 행 */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {FEATURES.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFeature(f.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                  activeFeature === f.key
                    ? f.activeCls
                    : `bg-white text-gray-500 border-gray-200 ${f.tagCls}`
                }`}
              >
                <f.Icon className="w-4 h-4" aria-hidden="true" />
                {t(f.titleKey)}
              </button>
            ))}
          </div>

          {/* 설명 패널 */}
          {FEATURES.map((f) => (
            activeFeature === f.key && (
              <div
                key={activeFeature}
                className={`animate-fade-slide-in flex items-start gap-4 max-w-lg mx-auto bg-white/80 border ${f.panelBorder} rounded-2xl px-6 py-5 shadow-sm`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${f.iconBg}`}>
                  <f.Icon className={`w-5 h-5 ${f.iconCls}`} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">{t(f.titleKey)}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{t(f.descKey)}</p>
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {/* 최근 실종 신고 */}
      <section className="max-w-5xl mx-auto px-4 pt-12 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="block w-1 h-5 bg-primary-600 rounded-full" aria-hidden="true" />
              {t('home.recentReports')}
            </h2>
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
