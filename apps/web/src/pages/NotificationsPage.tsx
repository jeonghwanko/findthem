import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BellOff,
  Sparkles,
  Eye,
  ChevronRight,
  PersonStanding,
  Dog,
  Cat,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { api } from '../api/client';
import type { ReportListResponse, Report } from '../api/client';
import { formatTimeAgo, getSubjectTypeLabel, type Locale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@findthem/shared';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useAuth } from '../hooks/useAuth';
import { assetSrc } from '../utils/webOrigin';

/* ── 상수 / 헬퍼 ─────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

function isRecent(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < DAY_MS;
}

function useLocale(): Locale {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (SUPPORTED_LOCALES as readonly string[]).includes(lang)
    ? (lang as Locale)
    : DEFAULT_LOCALE;
}

const ICON_CONFIG = {
  PERSON: { Icon: PersonStanding, iconBg: 'bg-blue-100', iconText: 'text-blue-600' },
  DOG:    { Icon: Dog,            iconBg: 'bg-amber-100', iconText: 'text-amber-600' },
  CAT:    { Icon: Cat,            iconBg: 'bg-rose-100',  iconText: 'text-rose-500' },
} as const;

/* ── 스켈레톤 ─────────────────────────────────── */

function SkeletonItem() {
  return (
    <div className="flex items-start gap-3 px-4 py-4 border-b border-gray-50">
      <div className="w-11 h-11 rounded-full bg-gray-200 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
        <div className="h-4 bg-gray-200 rounded animate-pulse w-40" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-32" />
      </div>
      <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse shrink-0" />
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="divide-y divide-gray-50">
      {Array.from({ length: 5 }, (_, i) => (
        <SkeletonItem key={i} />
      ))}
    </div>
  );
}

/* ── 비로그인 상태 ────────────────────────────── */

function GuestState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mb-5">
        <Bell className="w-9 h-9 text-indigo-300" />
      </div>
      <p className="text-base font-semibold text-gray-700 mb-2">
        {t('notifications.loginBannerTitle')}
      </p>
      <p className="text-sm text-gray-400 leading-relaxed mb-6">
        {t('notifications.emptyDescGuest')}
      </p>
      <Link
        to="/auth/login"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        {t('notifications.loginCta')}
      </Link>
    </div>
  );
}

/* ── 빈 상태 (로그인 후 신고 없음) ────────────── */

function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
        <BellOff className="w-9 h-9 text-gray-300" />
      </div>
      <p className="text-base font-semibold text-gray-700 mb-2">
        {t('notifications.emptyTitle')}
      </p>
      <p className="text-sm text-gray-400 leading-relaxed mb-6">
        {t('notifications.emptyDesc')}
      </p>
      <Link
        to="/browse"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        {t('notifications.browseReports')}
      </Link>
    </div>
  );
}

/* ── 알림 카드 ────────────────────────────────── */

function NotifCard({ report }: { report: Report }) {
  const { t } = useTranslation();
  const locale = useLocale();

  const config = ICON_CONFIG[report.subjectType as keyof typeof ICON_CONFIG] ?? ICON_CONFIG.PERSON;
  const { Icon } = config;
  const primaryPhoto = report.photos?.[0];
  const sightingCount = report._count?.sightings ?? 0;
  const matchCount = report._count?.matches ?? 0;
  const subjectLabel = getSubjectTypeLabel(report.subjectType, locale);
  const displayName = /^\d{8,}$/.test(report.name) ? subjectLabel : report.name;
  const fresh = isRecent(report.createdAt);

  return (
    <Link
      to={`/reports/${report.id}`}
      className="group flex items-start gap-3 px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors relative"
    >
      {/* 안읽음 도트 */}
      {fresh && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-500" />
      )}

      {/* 타입 아이콘 */}
      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${config.iconBg} ${config.iconText}`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* 텍스트 영역 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium text-indigo-600">{subjectLabel}</span>
          {fresh && (
            <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full leading-none">
              NEW
            </span>
          )}
          <span className="ml-auto text-[11px] text-gray-400 shrink-0">
            {formatTimeAgo(report.createdAt, locale)}
          </span>
        </div>

        <p className="font-semibold text-sm text-gray-900 truncate leading-snug">
          {displayName}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {matchCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-indigo-700 font-medium">
              <Sparkles className="w-3 h-3" />
              {t('notifications.matchCount', { count: matchCount })}
            </span>
          )}
          {sightingCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Eye className="w-3 h-3" />
              {t('notifications.sightingCount', { count: sightingCount })}
            </span>
          )}
          {matchCount === 0 && sightingCount === 0 && (
            <span className="text-xs text-gray-400">{t('notifications.noActivity')}</span>
          )}
        </div>
      </div>

      {/* 썸네일 */}
      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 relative">
        {primaryPhoto ? (
          <img
            src={assetSrc(primaryPhoto.thumbnailUrl ?? primaryPhoto.photoUrl)}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-300" />
          </div>
        )}
        {matchCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center">
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </span>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 self-center" />
    </Link>
  );
}

/* ── 섹션 헤더 ────────────────────────────────── */

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

/* ── 메인 페이지 ──────────────────────────────── */

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isLoggedIn = Boolean(user);

  const fetchReports = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get<ReportListResponse>('/reports/mine?limit=50');
      setReports(res.items);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('errors.SERVER_ERROR') }));
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    void fetchReports();
  }, [authLoading, isLoggedIn, fetchReports]);

  usePullToRefresh(fetchReports);

  /* 오늘 / 이전 분리 — 한 번만 순회 */
  const { recentReports, olderReports } = useMemo(() => {
    const recent: Report[] = [];
    const older: Report[] = [];
    for (const r of reports) {
      (isRecent(r.createdAt) ? recent : older).push(r);
    }
    return { recentReports: recent, olderReports: older };
  }, [reports]);

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-700" />
          <h1 className="text-base font-bold text-gray-900">{t('nav.notifications')}</h1>
        </div>
        {isLoggedIn && (
          <button
            onClick={() => { void fetchReports(); }}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-40"
            aria-label={t('notifications.refresh')}
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* 콘텐츠 */}
      {authLoading || (isLoggedIn && loading) ? (
        <SkeletonList />
      ) : !isLoggedIn ? (
        <GuestState />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 px-8 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => { void fetchReports(); }}
            className="text-xs text-indigo-600 underline underline-offset-2"
          >
            {t('notifications.retry')}
          </button>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <div>
          {recentReports.length > 0 && (
            <>
              <SectionHeader label={t('notifications.sectionToday')} />
              <div className="divide-y divide-gray-50">
                {recentReports.map((r) => (
                  <NotifCard key={r.id} report={r} />
                ))}
              </div>
            </>
          )}
          {olderReports.length > 0 && (
            <>
              <SectionHeader label={t('notifications.sectionEarlier')} />
              <div className="divide-y divide-gray-50">
                {olderReports.map((r) => (
                  <NotifCard key={r.id} report={r} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
