import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, LogOut, LogIn, FileText, List, Bell, BellOff, Users, MessageSquare } from 'lucide-react';
import type { User } from '../api/client';
import LanguageSwitcher from './LanguageSwitcher';
import { usePushNotification } from '../hooks/usePushNotification';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const { t } = useTranslation();
  const { subscribed, loading, isSupported, subscribe, unsubscribe } = usePushNotification();
  const { pathname } = useLocation();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const navLinkClass = (path: string) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
      isActive(path)
        ? 'text-primary-600 bg-primary-50 font-medium'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;

  return (
    <header
      className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
            <Search className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold text-gray-900">{t('brand')}</span>
        </Link>

        {/* 데스크톱 nav (md 이상에서만 표시) */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link to="/browse" className={navLinkClass('/browse')}>
            <List className="w-4 h-4" aria-hidden="true" />
            {t('nav.browse')}
          </Link>
          <Link to="/team" className={navLinkClass('/team')}>
            <Users className="w-4 h-4" aria-hidden="true" />
            {t('nav.team')}
          </Link>
          <Link to="/community" className={navLinkClass('/community')}>
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            {t('nav.community')}
          </Link>
          {user ? (
            <>
              <Link to="/my-reports" className={navLinkClass('/my-reports')}>
                <FileText className="w-4 h-4" aria-hidden="true" />
                {t('nav.myReports')}
              </Link>
              <Link
                to="/reports/new"
                className="ml-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {t('nav.newReport')}
              </Link>
              {isSupported && (
                <button
                  type="button"
                  onClick={() => { void (subscribed ? unsubscribe() : subscribe()); }}
                  disabled={loading}
                  title={subscribed ? t('push.unsubscribe') : t('push.subscribe')}
                  className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {subscribed ? (
                    <Bell className="w-4 h-4 text-primary-600" aria-hidden="true" />
                  ) : (
                    <BellOff className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 ml-2 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {t('nav.login')}
            </Link>
          )}
          <LanguageSwitcher />
        </nav>

        {/* 모바일 우측 (md 미만에서만 표시) */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="text-gray-500 hover:text-gray-900 text-sm transition-colors"
            >
              {t('nav.logout')}
            </button>
          ) : (
            <Link
              to="/login"
              className="border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
