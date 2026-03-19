import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { InquiryCategory } from '@findthem/shared';

interface InquiryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Pre-select category & hide selector (e.g. PARTNERSHIP from footer) */
  fixedCategory?: InquiryCategory;
  /** Override modal title */
  titleKey?: string;
}

const CATEGORIES: InquiryCategory[] = ['PAYMENT', 'REPORT', 'GENERAL'];

const CATEGORY_KEYS: Record<InquiryCategory, string> = {
  PAYMENT: 'inquiry.categoryPayment',
  REPORT: 'inquiry.categoryReport',
  GENERAL: 'inquiry.categoryGeneral',
  PARTNERSHIP: 'inquiry.categoryPartnership',
};

export default function InquiryModal({ open, onClose, onSuccess, fixedCategory, titleKey }: InquiryModalProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<InquiryCategory>(fixedCategory ?? 'PAYMENT');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Close on Escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/inquiries', { category: fixedCategory ?? category, title, content });
      setTitle('');
      setContent('');
      if (!fixedCategory) setCategory('PAYMENT');
      onSuccess?.();
      onClose();
    } catch {
      setError(t('inquiry.error'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{t(titleKey ?? 'inquiry.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label={t('common.close', '닫기')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          {!fixedCategory && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('inquiry.categoryLabel')}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InquiryCategory)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(CATEGORY_KEYS[cat])}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('inquiry.titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder={t('inquiry.titlePlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('inquiry.contentLabel')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              required
              rows={5}
              placeholder={t('inquiry.contentPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !title.trim() || !content.trim()}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors text-sm"
          >
            {submitting ? t('auth.processing') : t('inquiry.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
