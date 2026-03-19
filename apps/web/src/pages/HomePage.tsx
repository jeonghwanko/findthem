import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Camera, Megaphone, MessageSquare, ScanFace, type LucideIcon } from 'lucide-react';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import StatsStrip from '../components/StatsStrip';
import OutreachHighlights from '../components/OutreachHighlights';
import heroIllustration from '../assets/hero-illustration.svg';
import type { SubjectType } from '@findthem/shared';

const FILTERS: SubjectType[] = ['DOG', 'CAT'];

interface Feature {
  key: string;
  Icon: LucideIcon;
  tagCls: string;
  activeCls: string;
  iconCls: string;
  iconBg: string;
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
      {/* Hero — 캐치프레이즈 + 일러스트 + CTA + StatsStrip */}
      <section className="bg-gradient-to-b from-indigo-50 to-white border-b border-primary-100 py-12 sm:py-16 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12">
          {/* 텍스트 영역 */}
          <div className="flex-1 text-center md:text-left">
            <span className="inline-block bg-primary-100 text-primary-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
              {t('home.heroBadge')}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight whitespace-pre-line">
              {t('home.heroTitle')}
            </h1>
            <p className="text-gray-500 text-base sm:text-lg mb-7 max-w-lg leading-relaxed">
              {t('home.heroDesc')}
            </p>
            <div className="inline-flex flex-col gap-4 items-stretch">
              <div className="flex gap-3 flex-wrap">
                <Link
                  to="/sightings/new"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white px-7 py-3.5 rounded-xl font-semibold text-sm transition-all shadow-[0_4px_0_0_#c2410c,0_6px_12px_rgba(234,88,12,0.3)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_#c2410c,0_4px_8px_rgba(234,88,12,0.3)] active:translate-y-[4px] active:shadow-none"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  {t('home.submitSighting')}
                </Link>
                <Link
                  to="/reports/new"
                  className="inline-flex items-center gap-2 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5"
                >
                  {t('home.newReport')} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
              <StatsStrip stats={stats} recoveryRate={recoveryRate} />
            </div>
          </div>
          {/* 일러스트 영역 */}
          <div className="flex-shrink-0 w-64 sm:w-80 md:w-96">
            <img
              src={heroIllustration}
              alt=""
              className="w-full h-auto drop-shadow-lg"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      {/* 아웃리치 유튜버 하이라이트 */}
      <OutreachHighlights />

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
                className={`animate-fade-slide-in flex items-start gap-4 max-w-xl mx-auto bg-white/80 border ${f.panelBorder} rounded-2xl px-6 py-5 shadow-sm`}
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
