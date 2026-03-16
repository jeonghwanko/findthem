import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ShareButtonProps {
  title: string;
  description: string;
  imageUrl?: string;
  url?: string;
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (options: unknown) => void;
      };
    };
  }
}

export default function ShareButton({ title, description, imageUrl, url }: ShareButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shareUrl = url ?? window.location.href;

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleNativeShare() {
    try {
      await navigator.share({ title, text: description, url: shareUrl });
    } catch {
      // 취소 또는 미지원 — 메뉴 유지
    }
  }

  function handleTwitter() {
    const text = `${title}\n${description}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}&hashtags=FindThem,실종`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=550,height=450');
    setOpen(false);
  }

  async function handleKakao() {
    const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    if (!kakaoKey) {
      // 키 미설정 시 카카오링크 웹 fallback
      const fallbackUrl = `https://sharer.kakao.com/talk/friends/picker/link?app_key=&lang=ko&url=${encodeURIComponent(shareUrl)}`;
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer,width=400,height=600');
      setOpen(false);
      return;
    }

    // SDK 동적 로드
    if (!window.Kakao) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Kakao SDK load failed'));
        document.head.appendChild(s);
      });
    }

    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(kakaoKey);
    }

    window.Kakao?.Share.sendDefault({
      objectType: 'feed',
      content: {
        title,
        description,
        imageUrl: imageUrl
          ? (imageUrl.startsWith('http') ? imageUrl : `${window.location.origin}${imageUrl}`)
          : `${window.location.origin}/pwa-512x512.png`,
        link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
      },
      buttons: [{ title: t('share.kakaoButton'), link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }],
    });
    setOpen(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 미지원 (iOS Safari 일부) — prompt fallback
      window.prompt(t('share.copyPrompt'), shareUrl);
    }
    setOpen(false);
  }

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          if (canNativeShare) {
            void handleNativeShare();
          } else {
            setOpen((v) => !v);
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 hover:border-gray-400 rounded-xl text-gray-700 hover:text-gray-900 font-medium text-sm transition-colors"
        aria-label={t('share.button')}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {t('share.button')}
      </button>

      {open && !canNativeShare && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
          <button
            onClick={handleTwitter}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="text-base font-bold text-black">𝕏</span>
            {t('share.twitter')}
          </button>
          <button
            onClick={() => void handleKakao()}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
          >
            <span className="text-base">💬</span>
            {t('share.kakao')}
          </button>
          <button
            onClick={() => void handleCopy()}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
          >
            <span className="text-base">{copied ? '✅' : '🔗'}</span>
            {copied ? t('share.copied') : t('share.copyLink')}
          </button>
        </div>
      )}
    </div>
  );
}
