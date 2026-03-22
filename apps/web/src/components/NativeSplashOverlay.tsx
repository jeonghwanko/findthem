import { useEffect, useState } from 'react';

/**
 * 네이티브 앱 전용 스플래시 오버레이.
 * main.tsx에서 별도 React 루트로 즉시 마운트하여 auth/routing 이전에 표시.
 * capacitor.config.ts의 SplashScreen backgroundColor(#ffffff)와 일치.
 */
export function NativeSplashOverlay() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setFading(true);
      setTimeout(() => setGone(true), 600);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  if (gone) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <img
        src="/splash-icon.webp"
        alt="FindThem"
        style={{ width: 130, height: 130, borderRadius: '28%' }}
      />
      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
        <p
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.3px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          찾아줘 - AI 탐정
        </p>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '14px',
            color: '#6b7280',
            fontWeight: 400,
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          단서를 잇다.
        </p>
      </div>
    </div>
  );
}
