import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Search, Camera, MessageCircle, User as UserIcon } from 'lucide-react';
import type { User } from '../api/client';
import type { LucideIcon } from 'lucide-react';

interface BottomTabProps {
  user: User | null;
}

export default function BottomTab({ user }: BottomTabProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const path = location.pathname;

  const tabs: { to: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }[] = [
    { to: '/', label: t('nav.home'), Icon: Home, match: (p) => p === '/' },
    { to: '/team', label: t('nav.team'), Icon: Search, match: (p) => p.startsWith('/team') },
    { to: '/sightings/new', label: t('nav.sighting'), Icon: Camera, match: (p) => p === '/sightings/new' },
    { to: '/community', label: t('nav.community'), Icon: MessageCircle, match: (p) => p.startsWith('/community') },
    { to: user ? '/profile' : '/login', label: user ? t('nav.profile') : t('nav.login'), Icon: UserIcon, match: (p) => p === '/profile' || (!user && p === '/login') },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = tab.match(path);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-indigo-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <tab.Icon className={`w-6 h-6 mb-1 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
              <span className="leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
