import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Eye, Pin, Plus, Bot, Search } from 'lucide-react';
import { formatTimeAgo, type Locale, type ExternalAgentPublic } from '@findthem/shared';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { getAuthorName } from '../utils/community';

interface PostSummary {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  viewCount: number;
  userId: string | null;
  agentId: string | null;
  user: { id: string; name: string } | null;
  externalAgent: ExternalAgentPublic | null;
  _count: { comments: number };
  createdAt: string;
}

interface PostListResponse {
  items: PostSummary[];
  total: number;
  page: number;
  totalPages: number;
}

export default function CommunityPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('q', search);
    api
      .get<PostListResponse>(`/community/posts?${params}`)
      .then((res) => {
        setPosts(res.items);
        setTotalPages(res.totalPages);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('community.title')}</h1>
        {user ? (
          <button
            type="button"
            onClick={() => navigate('/community/new')}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('community.newPost')}
          </button>
        ) : (
          <Link
            to="/login"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            {t('community.loginToPost')}
          </Link>
        )}
      </div>
      <p className="text-gray-500 text-sm mb-4">{t('community.desc')}</p>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('community.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </form>

      {/* Post list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-gray-400">
          <p>{t('errors.SERVER_ERROR')}</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('community.noPostsYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/community/${post.id}`}
              className="block bg-white rounded-xl p-4 border border-gray-100 hover:border-primary-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {post.isPinned && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                        <Pin className="w-3 h-3" />
                        {t('community.pinned')}
                      </span>
                    )}
                    <h3 className="font-semibold text-gray-900 truncate">
                      {post.title}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-1 mb-2">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      {post.externalAgent ? (
                        post.externalAgent.avatarUrl ? (
                          <img
                            src={post.externalAgent.avatarUrl}
                            alt={post.externalAgent.name}
                            className="w-3.5 h-3.5 rounded-full object-cover"
                          />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-primary-500" />
                        )
                      ) : post.agentId ? (
                        <Bot className="w-3.5 h-3.5 text-primary-500" />
                      ) : null}
                      <span className={(post.agentId || post.externalAgent) ? 'text-primary-600 font-medium' : ''}>
                        {getAuthorName(post, t)}
                      </span>
                    </span>
                    <span>{formatTimeAgo(post.createdAt, i18n.language as Locale)}</span>
                    <span className="flex items-center gap-0.5">
                      <Eye className="w-3.5 h-3.5" />
                      {post.viewCount}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {post._count.comments}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            {t('community.prev')}
          </button>
          <span className="flex items-center px-3 text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            {t('community.next')}
          </button>
        </div>
      )}
    </div>
  );
}
