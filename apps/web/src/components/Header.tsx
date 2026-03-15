import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { User } from '../api/client';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="bg-primary-600 text-white shadow-lg sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          <span className="text-xl font-bold">{t('brand')}</span>
        </Link>

        {/* 데스크톱 nav (md 이상에서만 표시) */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
          <Link to="/browse" className="hover:text-primary-200 transition-colors">
            {t('nav.browse')}
          </Link>
          <a href="/devlog" className="hover:text-primary-200 transition-colors">
            데브로그
          </a>
          {user ? (
            <>
              <Link to="/my-reports" className="hover:text-primary-200 transition-colors">
                {t('nav.myReports')}
              </Link>
              <Link
                to="/reports/new"
                className="bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                {t('nav.newReport')}
              </Link>
              <button
                onClick={onLogout}
                className="text-primary-200 hover:text-white transition-colors"
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
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
              onClick={onLogout}
              className="text-primary-200 hover:text-white text-sm transition-colors"
            >
              {t('nav.logout')}
            </button>
          ) : (
            <Link
              to="/login"
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
