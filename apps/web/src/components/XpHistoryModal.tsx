import { useState, useEffect } from 'react';
import { formatTimeAgo } from '@findthem/shared';
import type { XpLogEntry } from '@findthem/shared';
import { api } from '../api/client';

const XP_ACTION_LABELS: Record<string, string> = {
  AD_WATCH: '광고 시청',
  SIGHTING: '목격 제보',
  COMMUNITY_POST: '커뮤니티 글 작성',
  COMMUNITY_COMMENT: '커뮤니티 댓글',
  SHARE: '공유',
  REFERRAL: '추천인',
  SPONSOR: '후원',
  GAME: '게임',
};

interface XpHistoryResponse {
  items: XpLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

interface XpHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

export default function XpHistoryModal({ open, onClose }: XpHistoryModalProps) {
  const [items, setItems] = useState<XpLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setLoading(true);
    void api.get<XpHistoryResponse>('/users/me/xp-history?page=1&limit=20')
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
        setPage(1);
      })
      .catch(() => {/* 무시 */})
      .finally(() => setLoading(false));
  }, [open]);

  async function handleLoadMore() {
    if (loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await api.get<XpHistoryResponse>(`/users/me/xp-history?page=${nextPage}&limit=20`);
      setItems((prev) => [...prev, ...data.items]);
      setPage(nextPage);
      setTotalPages(data.totalPages);
    } catch {/* 무시 */}
    finally {
      setLoadingMore(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">XP 이력</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">XP 이력이 없습니다</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-3">
                  <span className="text-sm text-gray-700">
                    {XP_ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-pink-500">
                      +{entry.xpAmount} XP
                    </span>
                    <span className="text-xs text-gray-400">{formatTimeAgo(entry.createdAt, 'ko')}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* 더 보기 */}
          {!loading && page < totalPages && (
            <div className="flex justify-center pt-3 pb-2">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="px-4 py-2 text-sm text-pink-600 border border-pink-200 rounded-lg hover:bg-pink-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin inline-block" />
                    로딩 중...
                  </span>
                ) : (
                  '더 보기'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
