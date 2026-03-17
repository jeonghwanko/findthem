import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAdminKey } from '../../api/admin.js';

const NAV_ITEMS = [
  { to: '/admin', label: '대시보드', icon: '📊', end: true },
  { to: '/admin/reports', label: '신고 관리', icon: '📋' },
  { to: '/admin/matches', label: '매칭 관리', icon: '🔗' },
  { to: '/admin/users', label: '사용자 관리', icon: '👤' },
  { to: '/admin/queues', label: '큐 모니터링', icon: '⚙️' },
  { to: '/admin/audit-logs', label: '감사 로그', icon: '📜' },
  { to: '/admin/agent', label: 'AI 에이전트', icon: '🤖' },
  { to: '/admin/devlog', label: '데브로그', icon: '✍️' },
  { to: '/admin/outreach', label: '아웃리치', icon: '📬' },
  { to: '/admin/ai-settings', label: 'AI 설정', icon: '🤖' },
  { to: '/admin/external-agents', label: '외부 에이전트', icon: '🔌' },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  function handleLogout() {
    clearAdminKey();
    void navigate('/admin/login');
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-700">
          <span className="font-bold text-lg tracking-tight">FindThem 관리자</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white font-medium'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-sm text-gray-400 hover:text-white py-2 px-3 rounded hover:bg-gray-800 transition-colors text-left"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 콘텐츠 영역 */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
