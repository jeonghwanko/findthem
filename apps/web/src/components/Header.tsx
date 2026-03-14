import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User } from '../api/client';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="bg-primary-600 text-white shadow-lg">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          <span className="text-xl font-bold">{t('brand')}</span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link to="/browse" className="hover:text-primary-200 transition-colors">
            {t('nav.browse')}
          </Link>
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
      </div>
    </header>
  );
}
