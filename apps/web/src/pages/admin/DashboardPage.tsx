import { useAdminData } from '../../hooks/useAdminApi.js';
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

export default function DashboardPage() {
  const { data, loading, error, refresh } = useAdminData<AdminOverviewStats>(
    '/admin/stats/overview',
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
        <button
          onClick={() => { void refresh(); }}
          disabled={loading}
          className="bg-indigo-600 text-white rounded px-3 py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-20 text-gray-400">데이터를 불러오는 중...</div>
      ) : data ? (
        <>
          {/* 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="전체 신고"
              value={data.reports.total}
              todayNew={data.reports.todayNew}
              details={[
                { label: '활성', value: data.reports.active, color: 'text-green-600' },
                { label: '발견', value: data.reports.found, color: 'text-blue-600' },
                { label: '정지', value: data.reports.suspended, color: 'text-red-500' },
              ]}
            />
            <StatCard
              title="전체 제보"
              value={data.sightings.total}
              todayNew={data.sightings.todayNew}
              details={[
                { label: '웹', value: data.sightings.bySource?.WEB ?? 0 },
                { label: '카카오', value: data.sightings.bySource?.KAKAO_CHATBOT ?? 0 },
                { label: '관리자', value: data.sightings.bySource?.ADMIN ?? 0 },
              ]}
            />
            <StatCard
              title="전체 매칭"
              value={data.matches.total}
              details={[
                { label: '대기', value: data.matches.pending, color: 'text-yellow-600' },
                { label: '확인', value: data.matches.confirmed, color: 'text-green-600' },
                {
                  label: '고신뢰',
                  value: data.matches.highConfidenceCount,
                  color: 'text-indigo-600',
                },
              ]}
            />
            <StatCard
              title="전체 사용자"
              value={data.users.total}
              todayNew={data.users.todayNew}
              details={[
                { label: '차단', value: data.users.blocked, color: 'text-red-500' },
              ]}
            />
          </div>

          {/* 큐 상태 */}
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-700 mb-3">큐 상태</h2>
            {data.queues && data.queues.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {data.queues.map((q) => (
                  <QueueCard key={q.name} q={q} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">큐 데이터 없음</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
