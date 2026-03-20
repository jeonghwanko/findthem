import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminData } from '../../hooks/useAdminApi.js';
import { adminApi } from '../../api/admin.js';
import type { QueueStatusSummary } from '@findthem/shared';

interface FailedJob {
  id: string;
  queueName: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
}

interface FailedJobsResponse {
  jobs: FailedJob[];
  total: number;
}

function QueueCard({ q }: { q: QueueStatusSummary }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm text-gray-800 truncate">{q.name}</h4>
        {q.paused && (
          <span className="text-xs text-yellow-600 bg-yellow-50 rounded px-1.5 py-0.5">
            일시정지
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="text-center">
          <div className="text-gray-400 text-xs mb-0.5">대기</div>
          <div className="font-bold text-gray-700">{q.waiting}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-400 text-xs mb-0.5">활성</div>
          <div className="font-bold text-blue-600">{q.active}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-400 text-xs mb-0.5">실패</div>
          <div className={`font-bold ${q.failed > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {q.failed}
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-xs text-gray-400">
        <div>완료: <span className="text-gray-600">{q.completed}</span></div>
        <div>지연: <span className="text-gray-600">{q.delayed}</span></div>
      </div>
    </div>
  );
}

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString('ko-KR');
}

function truncate(str: string, n: number) {
  return str.length > n ? `${str.slice(0, n)}...` : str;
}

export default function QueuesPage() {
  const { t } = useTranslation();
  const {
    data: queues,
    loading: queuesLoading,
    error: queuesError,
    refresh: refreshQueues,
  } = useAdminData<QueueStatusSummary[]>('/admin/stats/queues');

  const {
    data: failedJobsData,
    loading: failedLoading,
    error: failedError,
    refresh: refreshFailed,
  } = useAdminData<FailedJobsResponse>('/admin/stats/failed-jobs?limit=30');

  const [retryLoading, setRetryLoading] = useState<string | null>(null);

  function handleRefreshAll() {
    void refreshQueues();
    void refreshFailed();
  }

  async function handleRetry(job: FailedJob) {
    if (!window.confirm(`Job ${job.id}를 재시도하시겠습니까?`)) return;
    setRetryLoading(job.id);
    try {
      // TODO: API 구현 후 엔드포인트 연결
      await adminApi.post(
        `/admin/stats/failed-jobs/${job.queueName}/${job.id}/retry`,
      );
      void refreshFailed();
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      alert(t(`errors.${code}`, { defaultValue: t('admin.errorFallback') }));
    } finally {
      setRetryLoading(null);
    }
  }

  const failedJobs = failedJobsData?.jobs ?? [];

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-6">
        <h1 className="text-lg lg:text-xl font-bold text-gray-900">큐 모니터링</h1>
        <button
          onClick={handleRefreshAll}
          disabled={queuesLoading || failedLoading}
          className="bg-indigo-600 text-white rounded px-3 py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {queuesLoading || failedLoading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {/* 큐 상태 카드 */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">큐 상태</h2>

        {queuesError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-3 text-sm">
            {queuesError}
          </div>
        )}

        {queuesLoading && !queues ? (
          <div className="text-sm text-gray-400">데이터를 불러오는 중...</div>
        ) : queues && queues.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {queues.map((q) => (
              <QueueCard key={q.name} q={q} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-400">큐 데이터 없음</div>
        )}
      </section>

      {/* 실패한 작업 목록 */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          실패한 작업
          {failedJobs.length > 0 && (
            <span className="ml-2 text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5">
              {failedJobs.length}
            </span>
          )}
        </h2>

        {failedError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-3 text-sm">
            {failedError}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600 border-b">큐 이름</th>
                <th className="px-4 py-3 font-medium text-gray-600 border-b">Job ID</th>
                <th className="px-4 py-3 font-medium text-gray-600 border-b">작업 이름</th>
                <th className="px-4 py-3 font-medium text-gray-600 border-b">에러 메시지</th>
                <th className="px-4 py-3 font-medium text-gray-600 border-b text-center">시도</th>
                <th className="px-4 py-3 font-medium text-gray-600 border-b">시간</th>
                <th className="px-4 py-3 font-medium text-gray-600 border-b">액션</th>
              </tr>
            </thead>
            <tbody>
              {failedLoading && failedJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    데이터를 불러오는 중...
                  </td>
                </tr>
              ) : failedJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    실패한 작업이 없습니다.
                  </td>
                </tr>
              ) : (
                failedJobs.map((job) => (
                  <tr key={`${job.queueName}-${job.id}`} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 text-xs font-mono">
                      {job.queueName}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {String(job.id).slice(0, 12)}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{job.name}</td>
                    <td className="px-4 py-3 text-red-600 max-w-[200px] truncate text-xs">
                      {truncate(job.failedReason ?? '', 60)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {job.attemptsMade}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatTimestamp(job.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { void handleRetry(job); }}
                        disabled={retryLoading === job.id}
                        className="rounded px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                      >
                        {retryLoading === job.id ? '처리 중...' : '재시도'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  );
}
