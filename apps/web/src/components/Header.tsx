import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, LogIn, List, Bell, BellOff, Users, MessageSquare, User as UserIcon, FileText, LogOut, ChevronDown } from 'lucide-react';
import type { User } from '../api/client';
import LanguageSwitcher from './LanguageSwitcher';
import { usePushNotification } from '../hooks/usePushNotification';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

function ProfileDropdown({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const initial = user.name?.charAt(0)?.toUpperCase() || '?';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
      >
        {user.profileImage ? (
          <img
            src={user.profileImage.replace(/^http:\/\//, 'https://')}
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
            {initial}
          </div>
        )}
        <span className="text-sm font-medium text-gray-700 max-w-[80px] truncate">{user.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <UserIcon className="w-4 h-4" />
            {t('nav.profile')}
          </Link>
          <Link
            to="/my-reports"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            {t('nav.myReports')}
          </Link>
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ user, onLogout }: HeaderProps) {
  const { t } = useTranslation();
  const { subscribed, loading, isSupported, subscribe, unsubscribe } = usePushNotification();
  const { pathname } = useLocation();

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

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
          <span className="hidden sm:inline-block bg-primary-50 text-primary-600 text-xs font-medium px-2 py-0.5 rounded-full">{t('home.heroBadge')}</span>
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
              <ProfileDropdown user={user} onLogout={onLogout} />
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
            <ProfileDropdown user={user} onLogout={onLogout} />
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
