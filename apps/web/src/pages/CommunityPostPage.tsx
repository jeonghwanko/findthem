import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Trash2, Edit2, Eye, MessageSquare } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { getAuthorName, type ExternalAgent } from '../utils/community';

interface Comment {
  id: string;
  postId: string;
  userId: string | null;
  agentId: string | null;
  content: string;
  user: { id: string; name: string } | null;
  externalAgent: ExternalAgent | null;
  createdAt: string;
}

interface PostDetail {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  viewCount: number;
  userId: string | null;
  agentId: string | null;
  user: { id: string; name: string } | null;
  externalAgent: ExternalAgent | null;
  _count: { comments: number };
  comments: Comment[];
  createdAt: string;
}

export default function CommunityPostPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<PostDetail>(`/community/posts/${id}`)
      .then(setPost)
      .catch(() => navigate('/community'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  const isMyPost = user && post?.userId === user.id;

  const handleDelete = async () => {
    if (!post || !confirm(t('community.deleteConfirm'))) return;
    try {
      await api.delete(`/community/posts/${post.id}`);
      navigate('/community');
    } catch {
      setError(t('community.deleteError'));
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !post) return;
    setSubmitting(true);
    setError(null);
    try {
      const newComment = await api.post<Comment>(
        `/community/posts/${post.id}/comments`,
        { content: comment.trim() },
      );
      setPost({
        ...post,
        comments: [...post.comments, newComment],
        _count: { comments: post._count.comments + 1 },
      });
      setComment('');
    } catch {
      setError(t('community.commentError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!post) return;
    try {
      await api.delete(`/community/comments/${commentId}`);
      setPost({
        ...post,
        comments: post.comments.filter((c) => c.id !== commentId),
        _count: { comments: post._count.comments - 1 },
      });
    } catch {
      setError(t('community.commentDeleteError'));
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/4" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <Link
        to="/community"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('community.title')}
      </Link>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Post */}
      <article className="bg-white rounded-xl border border-gray-100 p-6 mb-8">
        <h1 className="text-xl font-bold text-gray-900 mb-3">{post.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
          <span className="flex items-center gap-1">
            {post.externalAgent ? (
              post.externalAgent.avatarUrl ? (
                <img
                  src={post.externalAgent.avatarUrl}
                  alt={post.externalAgent.name}
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : (
                <Bot className="w-4 h-4 text-primary-500" />
              )
            ) : post.agentId ? (
              <Bot className="w-4 h-4 text-primary-500" />
            ) : null}
            <span className={(post.agentId || post.externalAgent) ? 'text-primary-600 font-medium' : ''}>
              {getAuthorName(post, t)}
            </span>
          </span>
          <span>{formatDate(post.createdAt)}</span>
          <span className="flex items-center gap-0.5">
            <Eye className="w-3.5 h-3.5" />
            {post.viewCount}
          </span>
          {isMyPost && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/community/${post.id}/edit`)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={t('community.edit')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title={t('community.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
          {post.content}
        </div>
      </article>

      {/* Comments */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
          <MessageSquare className="w-5 h-5" />
          {t('community.comments')} ({post._count.comments})
        </h2>

        {post.comments.length === 0 && (
          <p className="text-sm text-gray-400 mb-6">{t('community.noComments')}</p>
        )}

        <div className="space-y-3 mb-6">
          {post.comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg p-4 ${(c.agentId || c.externalAgent) ? 'bg-primary-50 border border-primary-100' : 'bg-gray-50 border border-gray-100'}`}
            >
              <div className="flex items-center gap-2 mb-1.5 text-sm">
                {c.externalAgent ? (
                  c.externalAgent.avatarUrl ? (
                    <img
                      src={c.externalAgent.avatarUrl}
                      alt={c.externalAgent.name}
                      className="w-3.5 h-3.5 rounded-full object-cover"
                    />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-primary-500" />
                  )
                ) : c.agentId ? (
                  <Bot className="w-3.5 h-3.5 text-primary-500" />
                ) : null}
                <span className={`font-medium ${(c.agentId || c.externalAgent) ? 'text-primary-600' : 'text-gray-700'}`}>
                  {getAuthorName(c, t)}
                </span>
                <span className="text-gray-400 text-xs">{formatDate(c.createdAt)}</span>
                {user && c.userId === user.id && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteComment(c.id)}
                    className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>

        {/* Comment form */}
        {user ? (
          <form onSubmit={(e) => void handleCommentSubmit(e)} className="flex gap-2">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('community.commentPlaceholder')}
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!comment.trim() || submitting}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {t('community.commentSubmit')}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-400 text-center">
            <Link to="/login" className="text-primary-600 hover:underline">
              {t('community.loginToComment')}
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
