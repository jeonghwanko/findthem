import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../api/admin.js';

interface OutreachRequestItem {
  id: string;
  reportId: string;
  contactId: string;
  channel: string;
  status: string;
  draftSubject: string | null;
  draftContent: string;
  approvedAt: string | null;
  sentAt: string | null;
  externalId: string | null;
  errorMessage: string | null;
  createdAt: string;
  report: { id: string; name: string; subjectType: string };
  contact: {
    id: string;
    name: string;
    organization: string | null;
    type: string;
    email: string | null;
  };
}

interface OutreachListResponse {
  items: OutreachRequestItem[];
  total: number;
  page: number;
  totalPages: number;
}

const TABS: { value: string; label: string }[] = [
  { value: 'PENDING_APPROVAL', label: '대기 중' },
  { value: 'APPROVED', label: '승인됨' },
  { value: 'SENT', label: '발송됨' },
  { value: 'REJECTED', label: '거부됨' },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: '대기 중',
  APPROVED: '승인됨',
  SENT: '발송됨',
  REJECTED: '거부됨',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'EMAIL') {
    return <span className="text-lg leading-none" title="이메일">📧</span>;
  }
  if (channel === 'YOUTUBE_COMMENT') {
    return <span className="text-lg leading-none" title="유튜브 댓글">🎬</span>;
  }
  return <span className="text-lg leading-none">📨</span>;
}

interface OutreachCardProps {
  item: OutreachRequestItem;
  onApprove: (id: string, content: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  actionLoading: string | null;
}

function OutreachCard({ item, onApprove, onReject, actionLoading }: OutreachCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(item.draftContent);

  const isPending = item.status === 'PENDING_APPROVAL';
  const isLoading = actionLoading === item.id;

  function handleEditToggle() {
    if (!editing) {
      setEditedContent(item.draftContent);
    }
    setEditing((v) => !v);
    setExpanded(true);
  }

  async function handleApprove() {
    await onApprove(item.id, editedContent);
  }

  async function handleReject() {
    await onReject(item.id);
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
      {/* 헤더 */}
      <div className="flex items-start gap-3 mb-3">
        <ChannelIcon channel={item.channel} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{item.contact.name}</span>
            {item.contact.organization && (
              <span className="text-gray-500 text-sm">{item.contact.organization}</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {STATUS_LABEL[item.status] ?? item.status}
            </span>
          </div>
          {item.contact.email && (
            <div className="text-xs text-gray-400 mt-0.5">{item.contact.email}</div>
          )}
        </div>
        <div className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
          {formatDate(item.createdAt)}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3 mb-3 space-y-1.5 text-sm text-gray-600">
        <div>
          <span className="text-gray-400 text-xs mr-1">관련 신고</span>
          <span className="font-medium text-gray-800">{item.report.name}</span>
          <span className="text-gray-400 text-xs ml-1">({item.report.subjectType})</span>
        </div>
        {item.draftSubject && (
          <div>
            <span className="text-gray-400 text-xs mr-1">제목</span>
            <span className="text-gray-800">{item.draftSubject}</span>
          </div>
        )}
        {item.errorMessage && (
          <div className="text-xs text-red-500">오류: {item.errorMessage}</div>
        )}
        {item.sentAt && (
          <div className="text-xs text-green-600">발송일: {formatDate(item.sentAt)}</div>
        )}
        {item.approvedAt && (
          <div className="text-xs text-blue-600">승인일: {formatDate(item.approvedAt)}</div>
        )}
      </div>

      {/* 본문 미리보기 */}
      <div className="border border-gray-100 rounded-md overflow-hidden mb-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <span>본문 미리보기</span>
          <span className="text-gray-400 text-xs">{expanded ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {expanded && (
          <div className="p-3">
            {editing ? (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={10}
                className="w-full text-sm text-gray-700 leading-relaxed border border-indigo-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono"
              />
            ) : (
              <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words font-sans">
                {item.draftContent}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      {isPending && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleEditToggle}
            disabled={isLoading}
            className="border border-gray-300 rounded px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {editing ? '편집 취소' : '수정'}
          </button>
          <button
            onClick={() => { void handleApprove(); }}
            disabled={isLoading}
            className="rounded px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
          >
            {isLoading ? '처리 중...' : '승인 ✓'}
          </button>
          <button
            onClick={() => { void handleReject(); }}
            disabled={isLoading}
            className="rounded px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
          >
            {isLoading ? '처리 중...' : '거부 ✗'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function OutreachPage() {
  const [activeTab, setActiveTab] = useState('PENDING_APPROVAL');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OutreachListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('status', activeTab);
      params.set('page', String(page));
      params.set('limit', '20');
      const result = await adminApi.get<OutreachListResponse>(
        `/admin/outreach?${params.toString()}`,
      );
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleApprove(id: string, content: string) {
    setActionLoading(id);
    try {
      await adminApi.patch(`/admin/outreach/${id}/approve`, { content });
      await fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '승인 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    if (!window.confirm('이 아웃리치 요청을 거부하시겠습니까?')) return;
    setActionLoading(id);
    try {
      await adminApi.patch(`/admin/outreach/${id}/reject`, {});
      await fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '거부 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setPage(1);
  }

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">아웃리치 관리</h1>
        <button
          onClick={() => { void fetchData(); }}
          disabled={loading}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.value
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* 결과 요약 */}
      {!loading && data && (
        <div className="text-sm text-gray-500 mb-4">
          총 {total}건
        </div>
      )}

      {/* 카드 목록 */}
      {loading && items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">데이터를 불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {TABS.find((t) => t.value === activeTab)?.label} 아웃리치 요청이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <OutreachCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-6 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
