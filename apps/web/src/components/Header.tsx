import { Link } from 'react-router-dom';
import { User } from '../api/client';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="bg-primary-600 text-white shadow-lg">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          <span className="text-xl font-bold">찾아줘</span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link to="/browse" className="hover:text-primary-200 transition-colors">
            전체 목록
          </Link>
          {user ? (
            <>
              <Link to="/my-reports" className="hover:text-primary-200 transition-colors">
                내 신고
              </Link>
              <Link
                to="/reports/new"
                className="bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                실종 신고
              </Link>
              <button
                onClick={onLogout}
                className="text-primary-200 hover:text-white transition-colors"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
