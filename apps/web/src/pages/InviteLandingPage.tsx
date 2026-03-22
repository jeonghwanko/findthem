import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Megaphone, MessageCircle, X } from 'lucide-react';
import heroIllustration from '../assets/hero-illustration.svg';

const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.findthem.app';

const FEATURES = [
  { icon: Search, titleKey: 'invite.featureMatchTitle', descKey: 'invite.featureMatchDesc' },
  { icon: Megaphone, titleKey: 'invite.featurePromoTitle', descKey: 'invite.featurePromoDesc' },
  { icon: MessageCircle, titleKey: 'invite.featureChatTitle', descKey: 'invite.featureChatDesc' },
] as const;

export default function InviteLandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && /^[A-Z2-9]{8}$/.test(ref)) {
      setReferralCode(ref);
    } else {
      const stored = sessionStorage.getItem('referralCode');
      if (stored) setReferralCode(stored);
    }
  }, []);

  // 모달 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (showComingSoon) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showComingSoon]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-pink-50">
      {/* Hero Section */}
      <section className="px-4 pt-12 pb-8 text-center max-w-lg mx-auto">
        {referralCode && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-100 text-pink-700 rounded-full text-sm font-medium mb-6">
            <span>{t('invite.badge')}</span>
          </div>
        )}

        <img
          src={heroIllustration}
          alt=""
          className="w-48 h-48 mx-auto mb-6"
        />

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 whitespace-pre-line leading-tight mb-4">
          {t('invite.heroTitle')}
        </h1>

        <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
          {t('invite.heroDesc')}
        </p>
      </section>

      {/* Features */}
      <section className="px-4 pb-8 max-w-lg mx-auto">
        <div className="grid gap-3">
          {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="flex items-start gap-3 bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Icon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{t(titleKey)}</h3>
                <p className="text-gray-500 text-xs mt-0.5">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Download / CTA Section */}
      <section className="px-4 pb-16 max-w-lg mx-auto">
        <h2 className="text-lg font-bold text-center text-gray-900 mb-5">
          {t('invite.downloadTitle')}
        </h2>

        <div className="flex flex-col gap-3">
          {/* Google Play */}
          <a
            href={GOOGLE_PLAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-3.5 bg-black text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors"
          >
            <GooglePlayIcon />
            {t('invite.googlePlay')}
          </a>

          {/* App Store (Coming Soon) */}
          <button
            type="button"
            onClick={() => setShowComingSoon(true)}
            className="flex items-center justify-center gap-3 w-full py-3.5 bg-black text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors"
          >
            <AppleIcon />
            {t('invite.appStore')}
          </button>

          {/* Web CTA */}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full py-3 border-2 border-indigo-600 text-indigo-600 rounded-xl font-medium text-sm hover:bg-indigo-50 transition-colors"
          >
            {t('invite.startWeb')}
          </button>
        </div>
      </section>

      {/* Coming Soon Modal */}
      {showComingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowComingSoon(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowComingSoon(false); }}
          role="presentation"
        >
          <div
            className="relative bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <button
              type="button"
              onClick={() => setShowComingSoon(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AppleIcon className="text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {t('invite.comingSoonTitle')}
            </h3>
            <p className="text-sm text-gray-500 whitespace-pre-line mb-5">
              {t('invite.comingSoonDesc')}
            </p>
            <button
              type="button"
              onClick={() => setShowComingSoon(false)}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors"
            >
              {t('invite.comingSoonClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Inline SVG Icons ---------- */

function GooglePlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814a1.5 1.5 0 0 0-.609 1.2v17.972a1.5 1.5 0 0 0 .609 1.2l.1.063 10.065-10.065v-.237L3.71 1.751l-.1.063z" />
      <path d="M17.125 15.528 13.774 12.184v-.237l3.351-3.344.076.043 3.972 2.256c1.134.644 1.134 1.698 0 2.342l-3.972 2.256-.076.028z" />
      <path d="M17.201 15.485 13.774 12.065 3.609 22.186c.374.395 .992.444 1.69.05l11.902-6.751" />
      <path d="M17.201 8.646 5.3 1.895c-.699-.394-1.316-.345-1.69.05l10.164 10.12 3.427-3.42z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
