import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

interface PostDetail {
  id: string;
  title: string;
  content: string;
  userId: string | null;
}

export default function CommunityEditPostPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<PostDetail>(`/community/posts/${id}`)
      .then((post) => {
        // 본인 게시글이 아니면 상세 페이지로 redirect
        if (post.userId !== user?.id) {
          navigate(`/community/${id}`, { replace: true });
          return;
        }
        setTitle(post.title);
        setContent(post.content);
      })
      .catch(() => navigate('/community'))
      .finally(() => setLoading(false));
  }, [id, navigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/community/posts/${id}`, {
        title: title.trim(),
        content: content.trim(),
      });
      navigate(`/community/${id}`);
    } catch {
      setError(t('community.submitError'));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to={`/community/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('community.title')}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('community.edit')}</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            {t('community.writeTitle')}
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
            {t('community.writeContent')}
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            maxLength={10000}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => navigate(`/community/${id}`)}
            className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t('community.cancel')}
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !content.trim() || submitting}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? t('community.submitting') : t('community.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
