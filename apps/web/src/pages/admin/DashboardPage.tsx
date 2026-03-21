import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminData } from '../../hooks/useAdminApi.js';
import { adminApi } from '../../api/admin.js';
import type { AdminOverviewStats, QueueStatusSummary } from '@findthem/shared';

interface StatCardProps {
  title: string;
  value: number;
  todayNew?: number;
  details?: { label: string; value: number; color?: string }[];
}

function StatCard({ title, value, todayNew, details }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-sm text-gray-500 mb-1">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{value.toLocaleString()}</span>
        {todayNew !== undefined && todayNew > 0 && (
          <span className="text-sm text-green-600">+{todayNew} 오늘</span>
        )}
      </div>
      {details && (
        <div className="mt-3 flex gap-3 text-sm flex-wrap">
          {details.map((d) => (
            <span key={d.label} className={d.color || 'text-gray-500'}>
              {d.label}: {d.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({ q }: { q: QueueStatusSummary }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h4 className="font-medium text-sm mb-2 text-gray-800 truncate">{q.name}</h4>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-gray-400 text-xs">대기</span>
          <div className="font-bold">{q.waiting}</div>
        </div>
        <div>
          <span className="text-gray-400 text-xs">활성</span>
          <div className="font-bold text-blue-600">{q.active}</div>
        </div>
        <div>
          <span className="text-gray-400 text-xs">실패</span>
          <div className={`font-bold ${q.failed > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {q.failed}
          </div>
        </div>
      </div>
      {q.paused && (
        <span className="text-xs text-yellow-600 mt-1 inline-block">일시정지</span>
      )}
    </div>
  );
}

const ALL_SOURCES = ['animal-api', 'safe182'];

interface CrawlTriggerResponse {
  message: string;
  jobIds: string[];
}

interface CrawlStats {
  total: number;
  bySource: { externalSource: string; _count: { id: number } }[];
  latestAt: string | null;
  latestSource: string | null;
}

function CrawlSection() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<string[]>(['animal-api']);
  const [triggering, setTriggering] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [personCrawlEnabled, setPersonCrawlEnabled] = useState(false);
  const [personToggling, setPersonToggling] = useState(false);

  async function loadStats() {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const result = await adminApi.get<CrawlStats>('/admin/crawl/stats');
      setStats(result);
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      setStatsError(t(`errors.${code}`, { defaultValue: t('admin.crawl.statsError') }));
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();
    adminApi.get<{ settings: { key: string; value: string }[] }>('/admin/ai/settings')
      .then((res) => {
        const val = res.settings.find((s) => s.key === 'crawl:enable-person');
        setPersonCrawlEnabled(val?.value === 'true');
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePersonToggle() {
    const newVal = !personCrawlEnabled;
    setPersonToggling(true);
    try {
      await adminApi.put('/admin/ai/settings', { key: 'crawl:enable-person', value: String(newVal) });
      setPersonCrawlEnabled(newVal);
    } catch { /* ignore */ }
    setPersonToggling(false);
  }

  useEffect(() => {
    if (!statusMsg) return;
    const timer = setTimeout(() => setStatusMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMsg]);

  function toggleSource(source: string) {
    setSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source],
    );
  }

  async function handleTrigger() {
    if (sources.length === 0) return;
    setTriggering(true);
    setStatusMsg(null);
    try {
      await adminApi.post<CrawlTriggerResponse>('/admin/crawl/trigger', { sources });
      setStatusMsg({ type: 'success', text: t('admin.crawl.triggerSuccess') });
      await loadStats();
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      const msg = t(`errors.${code}`, { defaultValue: t('admin.crawl.triggerError') });
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setTriggering(false);
    }
  }

  function formatLatestAt(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString();
  }

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-700 mb-3">{t('admin.crawl.title')}</h2>
      <div className="bg-white rounded-lg shadow p-5">
        <p className="text-sm text-gray-500 mb-4">{t('admin.crawl.description')}</p>

        {/* 수집 현황 */}
        <div className="bg-gray-50 rounded-md px-4 py-3 mb-4 text-sm">
          {statsLoading ? (
            <span className="text-gray-400">{t('admin.crawl.statsLoading')}</span>
          ) : statsError ? (
            <span className="text-red-500">{statsError}</span>
          ) : stats && stats.total > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-gray-800">
                {t('admin.crawl.statsTotal', { count: stats.total })}
              </span>
              {stats.bySource.map((s) => (
                <span key={s.externalSource} className="text-gray-500">
                  {s.externalSource}: {s._count.id.toLocaleString()}건
                </span>
              ))}
              {stats.latestAt && (
                <span className="text-gray-400 text-xs ml-auto">
                  {t('admin.crawl.statsLastAt', {
                    time: formatLatestAt(stats.latestAt),
                    source: stats.latestSource ?? '-',
                  })}
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400">{t('admin.crawl.statsNoData')}</span>
          )}
        </div>

        {/* 사람 실종 정보 수집 토글 */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-md">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={personCrawlEnabled}
              onChange={() => { void handlePersonToggle(); }}
              disabled={personToggling}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-sm font-medium text-gray-700">{t('admin.crawl.enablePerson')}</span>
          </label>
          <span className="text-xs text-gray-400">{t('admin.crawl.enablePersonDesc')}</span>
        </div>

        <div className="flex flex-wrap gap-4 mb-4">
          {ALL_SOURCES.map((source) => (
            <label key={source} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sources.includes(source)}
                onChange={() => toggleSource(source)}
                disabled={triggering}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm font-medium text-gray-700">{source}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { void handleTrigger(); }}
            disabled={triggering || sources.length === 0}
            className="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggering ? t('admin.crawl.triggering') : t('admin.crawl.triggerBtn')}
          </button>
          {statusMsg && (
            <span
              className={`text-sm ${statusMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
            >
              {statusMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface CleanupResult {
  total: number;
  broken: number;
  deleted: number;
}

function BrokenPhotosSection() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCleanup() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminApi.post<CleanupResult>('/admin/cleanup-broken-photos', {});
      setResult(res);
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('admin.crawl.triggerError') }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-700 mb-3">{t('admin.dashboard.brokenPhotos')}</h2>
      <div className="bg-white rounded-lg shadow p-5">
        <p className="text-sm text-gray-500 mb-4">{t('admin.dashboard.brokenPhotosDesc')}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { void handleCleanup(); }}
            disabled={running}
            className="bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? t('admin.dashboard.brokenPhotosRunning') : t('admin.dashboard.brokenPhotosBtn')}
          </button>
          {result && (
            <span className="text-sm text-green-600">
              {t('admin.dashboard.brokenPhotosResult', { total: result.total, broken: result.broken, deleted: result.deleted })}
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data, loading, error, refresh } = useAdminData<AdminOverviewStats>(
    '/admin/stats/overview',
  );

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-6">
        <h1 className="text-lg lg:text-xl font-bold text-gray-900">{t('admin.dashboard.title')}</h1>
        <button
          onClick={() => { void refresh(); }}
          disabled={loading}
          className="bg-indigo-600 text-white rounded px-3 py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? t('loading') : t('admin.dashboard.refresh')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-20 text-gray-400">{t('admin.dashboard.loadingData')}</div>
      ) : data ? (
        <>
          {/* 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              title={t('admin.dashboard.totalReports')}
              value={data.reports.total}
              todayNew={data.reports.todayNew}
              details={[
                { label: t('admin.dashboard.active'), value: data.reports.active, color: 'text-green-600' },
                { label: t('admin.dashboard.found'), value: data.reports.found, color: 'text-blue-600' },
                { label: t('admin.dashboard.suspended'), value: data.reports.suspended, color: 'text-red-500' },
              ]}
            />
            <StatCard
              title={t('admin.dashboard.totalSightings')}
              value={data.sightings.total}
              todayNew={data.sightings.todayNew}
              details={[
                { label: t('admin.dashboard.web'), value: data.sightings.bySource?.WEB ?? 0 },
                { label: t('admin.dashboard.kakao'), value: data.sightings.bySource?.KAKAO_CHATBOT ?? 0 },
                { label: t('admin.dashboard.adminLabel'), value: data.sightings.bySource?.ADMIN ?? 0 },
              ]}
            />
            <StatCard
              title={t('admin.dashboard.totalMatches')}
              value={data.matches.total}
              details={[
                { label: t('admin.dashboard.pending'), value: data.matches.pending, color: 'text-yellow-600' },
                { label: t('admin.dashboard.confirmed'), value: data.matches.confirmed, color: 'text-green-600' },
                {
                  label: t('admin.dashboard.highConfidence'),
                  value: data.matches.highConfidenceCount,
                  color: 'text-indigo-600',
                },
              ]}
            />
            <StatCard
              title={t('admin.dashboard.totalUsers')}
              value={data.users.total}
              todayNew={data.users.todayNew}
              details={[
                { label: t('admin.dashboard.blocked'), value: data.users.blocked, color: 'text-red-500' },
              ]}
            />
          </div>

          {/* 데이터 수집 */}
          <CrawlSection />

          {/* 깨진 사진 정리 */}
          <BrokenPhotosSection />

          {/* 큐 상태 */}
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-700 mb-3">{t('admin.dashboard.queueStatus')}</h2>
            {data.queues && data.queues.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {data.queues.map((q) => (
                  <QueueCard key={q.name} q={q} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">{t('admin.dashboard.noQueueData')}</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
