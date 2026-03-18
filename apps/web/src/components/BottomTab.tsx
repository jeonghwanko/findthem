import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { User } from '../api/client';

interface BottomTabProps {
  user: User | null;
}

export default function BottomTab({ user }: BottomTabProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const path = location.pathname;

  const tabs = [
    { to: '/', label: t('nav.home'), icon: '🏠', match: (p: string) => p === '/' },
    { to: '/browse', label: t('nav.browse'), icon: '🔍', match: (p: string) => p.startsWith('/browse') },
    { to: '/reports/new', label: t('nav.newReport'), icon: '➕', match: (p: string) => p === '/reports/new', requireAuth: true },
    { to: '/community', label: t('nav.community'), icon: '💬', match: (p: string) => p.startsWith('/community') },
    { to: user ? '/profile' : '/login', label: user ? t('nav.profile') : t('nav.login'), icon: '👤', match: (p: string) => p === '/profile' || (!user && p === '/login') },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = tab.match(path);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                isActive
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-xl mb-0.5">{tab.icon}</span>
              <span className="leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
