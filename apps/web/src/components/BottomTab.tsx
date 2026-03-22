import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Camera, MessageCircle, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

interface TabItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  match: (p: string) => boolean;
}

export default function BottomTab() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const threshold = 10;
    const onScroll = () => {
      const y = window.scrollY;
      if (y - lastScrollY.current > threshold) setHidden(true);
      else if (lastScrollY.current - y > threshold) setHidden(false);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 페이지 이동 시 다시 표시
  useEffect(() => { setHidden(false); }, [pathname]);

  const isSightingActive = pathname === '/sightings/new';

  const leftTabs: TabItem[] = [
    { to: '/', label: t('nav.home'), Icon: Home, match: (p) => p === '/' },
    { to: '/team', label: t('nav.team'), Icon: Search, match: (p) => p.startsWith('/team') },
  ];

  const rightTabs: TabItem[] = [
    { to: '/community', label: t('nav.community'), Icon: MessageCircle, match: (p) => p.startsWith('/community') },
    { to: '/notifications', label: t('nav.notifications'), Icon: Bell, match: (p) => p.startsWith('/notifications') },
  ];

  return (
    <>
      {/* FAB 제보 버튼 — 탭바와 독립, 항상 표시. 탭바 보일 때는 탭바 위에 걸침, 숨기면 하단 고정 */}
      <Link
        to="/sightings/new"
        className="md:hidden fixed z-50 left-1/2 -translate-x-1/2 active:scale-95 transition-all duration-300"
        style={{ bottom: hidden ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 'calc(env(safe-area-inset-bottom, 0px) + 22px)' }}
        aria-label={t('nav.sighting')}
      >
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl ${
            isSightingActive ? 'ring-4 ring-indigo-200' : ''
          }`}
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
        >
          <Camera className="w-8 h-8 text-white" strokeWidth={2.5} />
        </div>
      </Link>

      {/* 탭바 — 스크롤 시 숨김 */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${hidden ? 'translate-y-full' : 'translate-y-0'}`}>
        <div
          className="bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex h-14">
            {leftTabs.map((tab) => {
              const isActive = tab.match(pathname);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors pressable ${
                    isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <tab.Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className="leading-none">{tab.label}</span>
                </Link>
              );
            })}

            {/* 가운데 공간 — FAB 라벨 */}
            <div className="flex-1 flex flex-col items-center justify-end pb-2">
              <span
                className={`text-xs font-semibold leading-none transition-colors ${
                  isSightingActive ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                {t('nav.sighting')}
              </span>
            </div>

            {rightTabs.map((tab) => {
              const isActive = tab.match(pathname);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors pressable ${
                    isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <tab.Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className="leading-none">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
