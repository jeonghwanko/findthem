import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Camera } from 'lucide-react';
import { api, type Report, type ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';
import OutreachHighlights from '../components/OutreachHighlights';
import heroIllustration from '../assets/hero-illustration.svg';
import type { SubjectType } from '@findthem/shared';

const FILTERS: SubjectType[] = ['DOG', 'CAT'];

interface Feature {
  key: string;
  titleKey: string;
  descKey: string;
  userCopyKey: string;
  agentImg: string;
}

const FEATURES: Feature[] = [
  {
    key: 'promo',
    titleKey: 'home.featurePromo',
    descKey: 'home.featurePromoDesc',
    userCopyKey: 'home.featurePromoUser',
    agentImg: '/agents/promotion.webp',
  },
  {
    key: 'chatbot',
    titleKey: 'home.featureChatbot',
    descKey: 'home.featureChatbotDesc',
    userCopyKey: 'home.featureChatbotUser',
    agentImg: '/agents/chatbot-alert.webp',
  },
  {
    key: 'matching',
    titleKey: 'home.featureMatching',
    descKey: 'home.featureMatchingDesc',
    userCopyKey: 'home.featureMatchingUser',
    agentImg: '/agents/image-matching.webp',
  },
];

interface Stats {
  total: number;
  found: number;
}

/** Animated count-up number using IntersectionObserver */
function AnimatedCount({ value, duration = 1500 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (value === 0) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            setDisplay(Math.round(progress * value));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{display.toLocaleString()}</span>;
}

/** App install banner shown on mobile web only */
function AppBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('appBannerDismissed');
    if (!dismissed && window.innerWidth < 768) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem('appBannerDismissed', '1');
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm mx-4 mb-4">
      <img src="/pwa-192x192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{t('home.appBannerTitle')}</p>
        <p className="text-xs text-gray-500 truncate">{t('home.appBannerDesc')}</p>
      </div>
      <a
        href="https://play.google.com/store/apps/details?id=com.findthem.app"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
      >
        {t('home.appBannerInstall')}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('home.appBannerClose')}
        className="shrink-0 text-gray-400 hover:text-gray-600 p-1"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SubjectType>('DOG');
  const [stats, setStats] = useState<Stats | null>(null);
  const [urgentReports, setUrgentReports] = useState<Report[]>([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<ReportListResponse>('/reports?limit=1'),
      api.get<ReportListResponse>('/reports?status=FOUND&limit=1'),
    ]).then(([all, found]) => {
      setStats({ total: all.total ?? 0, found: found.total ?? 0 });
    }).catch(() => {});
  }, []);

  // Urgent reports (긴급 수배 띠): always ACTIVE, limit 4
  useEffect(() => {
    api.get<ReportListResponse>('/reports?limit=4&status=ACTIVE')
      .then((data) => setUrgentReports(data.items ?? []))
      .catch(() => setUrgentReports([]));
  }, []);

  const loadCount = isMobile ? 6 : 8;

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api.get<ReportListResponse>(`/reports?limit=${loadCount}&type=${filter}&status=ACTIVE`)
      .then((data) => {
        if (!ignore) setReports(data.items ?? []);
      })
      .catch(() => { if (!ignore) setReports([]); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [filter, loadCount]);

  const recoveryRate = stats && stats.total > 0
    ? Math.round((stats.found / stats.total) * 100)
    : null;

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 to-white border-b border-primary-100 py-12 sm:py-16 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12">
          {/* Text area */}
          <div className="flex-1 text-center md:text-left">
            <span className="inline-block bg-primary-100 text-primary-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
              {t('home.heroBadge')}
            </span>
            <h1 className="text-4xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight whitespace-pre-line">
              {t('home.heroTitle')}
            </h1>
            <p className="text-gray-500 text-base sm:text-lg mb-7 max-w-lg leading-relaxed">
              {t('home.heroDesc')}
            </p>

            {/* Primary CTA: full-width on mobile */}
            <div className="flex flex-col gap-4 items-stretch md:items-start">
              <Link
                to="/sightings/new"
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-7 py-4 rounded-xl font-semibold text-base transition-all shadow-[0_4px_0_0_#b45309,0_6px_12px_rgba(234,88,12,0.3)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_#b45309,0_4px_8px_rgba(234,88,12,0.3)] active:translate-y-[4px] active:shadow-none w-full md:w-auto"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                {t('home.submitSighting')}
              </Link>

              {/* Secondary CTA: text link */}
              <Link
                to="/team"
                className="inline-flex items-center justify-center md:justify-start gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors"
              >
                {t('home.teamLink')}
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>

              {/* Agent avatar trio */}
              <div className="flex items-center gap-3 mt-1">
                <div className="flex -space-x-2">
                  {['/agents/image-matching.webp', '/agents/promotion.webp', '/agents/chatbot-alert.webp'].map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm"
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500">{t('home.agentSubCopy')}</p>
              </div>
            </div>
          </div>

          {/* Illustration — hidden on mobile */}
          <div className="hidden md:block flex-shrink-0 w-64 sm:w-80 md:w-96">
            <img
              src={heroIllustration}
              alt=""
              className="w-full h-auto drop-shadow-lg"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      {/* Stats band */}
      <div className="bg-indigo-600 w-full">
        <div className="max-w-5xl mx-auto grid grid-cols-3 divide-x divide-white/20 py-6 px-4">
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-3xl font-bold text-white">
              <AnimatedCount value={stats?.total ?? 0} />
            </span>
            <span className="text-sm text-indigo-200">{t('home.statTotal')}</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-3xl font-bold text-white">
              <AnimatedCount value={stats?.found ?? 0} />
            </span>
            <span className="text-sm text-indigo-200">{t('home.statFound')}</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-3xl font-bold text-white">
              {recoveryRate !== null ? (
                <><AnimatedCount value={recoveryRate} />%</>
              ) : (
                '—'
              )}
            </span>
            <span className="text-sm text-indigo-200">{t('home.statRate')}</span>
          </div>
        </div>
      </div>

      {/* Urgent strip (긴급 수배 띠) */}
      {urgentReports.length > 0 && (
        <div className="bg-amber-50 border-y border-amber-100 py-4 px-4">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
              <span className="text-sm font-semibold text-gray-800">{t('home.urgentTitle')}</span>
              <Link
                to="/browse?status=ACTIVE"
                className="ml-auto text-xs text-amber-700 hover:text-amber-900 font-medium"
              >
                {t('home.urgentViewAll')}
              </Link>
            </div>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 pb-1">
                {urgentReports.map((r) => (
                  <Link
                    key={r.id}
                    to={`/reports/${r.id}`}
                    className="shrink-0 flex items-center gap-2.5 bg-white rounded-xl border border-amber-100 px-3 py-2.5 hover:shadow-md transition-shadow min-w-[160px]"
                  >
                    {r.photos?.[0] ? (
                      <img
                        src={r.photos[0].thumbnailUrl ?? r.photos[0].photoUrl}
                        alt={r.name}
                        className="w-9 h-9 rounded-full object-cover shrink-0 border border-amber-100"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-amber-100 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400 truncate">{r.lastSeenAddress ?? ''}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outreach highlights */}
      <OutreachHighlights />

      {/* Feature cards */}
      <div className="bg-gray-50 border-y border-gray-100 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.key}
                className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex gap-4 items-start"
              >
                <img
                  src={f.agentImg}
                  alt=""
                  aria-hidden="true"
                  className="w-14 h-14 rounded-2xl object-cover border border-gray-100 shadow-sm flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 mb-1">{t(f.titleKey)}</p>
                  <p className="text-sm text-indigo-600 font-medium mb-1.5">{t(f.userCopyKey)}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{t(f.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent reports */}
      <section className="max-w-5xl mx-auto px-4 pt-12 pb-24 md:pb-16">
        {/* App install banner (mobile web only) */}
        <AppBanner />

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
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {t('home.viewAll')}
          </Link>
        </div>

        {loading ? (
          <div
            className={`grid grid-cols-2 md:grid-cols-4 gap-4`}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label={t('loading')}
          >
            {Array.from({ length: loadCount }).map((_, i) => (
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
