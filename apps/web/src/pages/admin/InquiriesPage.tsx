import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api/admin.js';
import type { InquiryAdmin, InquiryListResponse } from '@findthem/shared';

const TABS: { value: string; label: string }[] = [
  { value: 'OPEN', label: '미답변' },
  { value: 'REPLIED', label: '답변 완료' },
  { value: 'CLOSED', label: '종료' },
  { value: '', label: '전체' },
];

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-yellow-100 text-yellow-700',
  REPLIED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: '미답변',
  REPLIED: '답변 완료',
  CLOSED: '종료',
};

const CATEGORY_LABEL: Record<string, string> = {
  PAYMENT: '결제 문의',
  REPORT: '신고 문의',
  GENERAL: '기타',
  PARTNERSHIP: '제휴 문의',
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

interface InquiryRowProps {
  item: InquiryAdmin;
  onReply: (id: string, replyContent: string) => Promise<void>;
  actionLoading: string | null;
}

function InquiryRow({ item, onReply, actionLoading }: InquiryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState(item.replyContent ?? '');
  const isLoading = actionLoading === item.id;
  const replyingRef = useRef(false);

  // Sync replyText when item updates (after fetchData)
  useEffect(() => {
    setReplyText(item.replyContent ?? '');
  }, [item.replyContent]);

  async function handleReply() {
    if (!replyText.trim() || replyingRef.current) return;
    replyingRef.current = true;
    try {
      await onReply(item.id, replyText);
    } finally {
      replyingRef.current = false;
    }
  }

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
          {CATEGORY_LABEL[item.category] ?? item.category}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
          {item.title}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
          {item.user?.name ?? '비회원'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
          {formatDate(item.createdAt)}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-4 bg-gray-50 border-t border-gray-100">
            <div className="space-y-4 max-w-2xl">
              {/* 원문 */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">문의 내용</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-white border border-gray-200 rounded-lg p-3">
                  {item.content}
                </p>
              </div>

              {/* 기존 답변 */}
              {item.replyContent && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    기존 답변 {item.repliedAt && <span className="text-gray-400 font-normal">({formatDate(item.repliedAt)})</span>}
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-green-50 border border-green-100 rounded-lg p-3">
                    {item.replyContent}
                  </p>
                </div>
              )}

              {/* 답변 폼 */}
              {item.status !== 'CLOSED' && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {item.replyContent ? '답변 수정' : '답변 작성'}
                  </p>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    placeholder="답변 내용을 입력하세요"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => { void handleReply(); }}
                      disabled={isLoading || !replyText.trim()}
                      className="rounded px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? '처리 중...' : '답변 등록'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function InquiriesPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InquiryListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeTab) params.set('status', activeTab);
      params.set('page', String(page));
      params.set('limit', '20');
      const result = await adminApi.get<InquiryListResponse>(
        `/admin/inquiries?${params.toString()}`,
      );
      setData(result);
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('admin.errorFallback') }));
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleReply(id: string, replyContent: string) {
    setActionLoading(id);
    try {
      await adminApi.patch(`/admin/inquiries/${id}/reply`, { replyContent });
      await fetchData();
    } catch {
      setError(t('admin.errorFallback'));
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
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <h1 className="text-lg lg:text-xl font-bold text-gray-900">문의 관리</h1>
        <button
          onClick={() => { void fetchData(); }}
          disabled={loading}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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

      {!loading && data && (
        <div className="text-sm text-gray-500 mb-4">총 {total}건</div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">유형</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제목</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작성자</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">날짜</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-gray-400">데이터를 불러오는 중...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-gray-400">
                    {TABS.find((t) => t.value === activeTab)?.label ?? '전체'} 문의가 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <InquiryRow
                    key={item.id}
                    item={item}
                    onReply={handleReply}
                    actionLoading={actionLoading}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
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
