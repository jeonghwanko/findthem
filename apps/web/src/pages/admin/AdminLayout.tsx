import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { clearAdminKey } from '../../api/admin.js';

const NAV_ITEMS = [
  { to: '/admin', label: '대시보드', icon: '📊', end: true },
  { to: '/admin/reports', label: '신고 관리', icon: '📋' },
  { to: '/admin/matches', label: '매칭 관리', icon: '🔗' },
  { to: '/admin/users', label: '사용자 관리', icon: '👤' },
  { to: '/admin/inquiries', label: '문의 관리', icon: '💬' },
  { to: '/admin/queues', label: '큐 모니터링', icon: '⚙️' },
  { to: '/admin/audit-logs', label: '감사 로그', icon: '📜' },
  { to: '/admin/agent', label: 'AI 에이전트', icon: '🤖' },
  { to: '/admin/devlog', label: '데브로그', icon: '✍️' },
  { to: '/admin/outreach', label: '아웃리치', icon: '📬' },
  { to: '/admin/ai-settings', label: 'AI 설정', icon: '🔧' },
  { to: '/admin/external-agents', label: '외부 에이전트', icon: '🔌' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    clearAdminKey();
    void navigate('/admin/login');
  }

  function handleNavClick() {
    setSidebarOpen(false);
  }

  // 현재 페이지 타이틀 — 가장 긴 경로부터 매칭 (startsWith 오버랩 방지)
  const currentPage = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => location.pathname === item.to || (!item.end && location.pathname.startsWith(item.to + '/')))
    ?? NAV_ITEMS[0];

  return (
    <div className="flex h-dvh bg-gray-50 overflow-hidden">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-gray-900 text-white flex flex-col flex-shrink-0 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">FindThem 관리자</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white p-1"
            aria-label="메뉴 닫기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={handleNavClick}
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 모바일 헤더 */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900 p-1"
            aria-label="메뉴 열기"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-gray-900 text-sm">{currentPage?.icon} {currentPage?.label}</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
