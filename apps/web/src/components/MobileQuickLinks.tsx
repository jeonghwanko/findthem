import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Newspaper, MessageCircle } from 'lucide-react';
import InquiryModal from './InquiryModal';

export default function MobileQuickLinks() {
  const { t } = useTranslation();
  const [inquiryOpen, setInquiryOpen] = useState(false);

  return (
    <>
      <div className="md:hidden flex items-center justify-center gap-4 mt-10 mb-6 text-sm text-gray-400">
        <a href="/devlog" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-gray-600 transition-colors">
          <Newspaper className="w-3.5 h-3.5" />
          {t('nav.devlog')}
        </a>
        <span className="text-gray-200">|</span>
        <a href="https://x.com/yoooonion" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-gray-600 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <span className="text-gray-200">|</span>
        <button type="button" onClick={() => setInquiryOpen(true)} className="flex items-center gap-1 hover:text-gray-600 transition-colors">
          <MessageCircle className="w-3.5 h-3.5" />
          {t('inquiry.partnership')}
        </button>
      </div>
      <InquiryModal open={inquiryOpen} onClose={() => setInquiryOpen(false)} fixedCategory="PARTNERSHIP" />
    </>
  );
}
