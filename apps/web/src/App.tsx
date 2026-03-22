import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import Header from './components/Header';
import BottomTab from './components/BottomTab';
import AgentChatWidget from './components/AgentChatWidget';
import InquiryModal from './components/InquiryModal';
import AdminRoute from './components/AdminRoute';
import { XpToastProvider } from './components/XpRewardToast';
import { PullToRefreshProvider } from './context/PullToRefreshContext';
import PullToRefreshContainer from './components/PullToRefreshContainer';
// AdminLayout은 admin 경로 내 공통 쉘이므로 즉시 로드
import AdminLayout from './pages/admin/AdminLayout';
import { userRoutes } from './routes/userRoutes';
import { useNativeOAuth } from './hooks/useNativeOAuth';

// 관리자 페이지 — lazy 로드 (일반 사용자에게는 불필요)
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ReportsManagePage = lazy(() => import('./pages/admin/ReportsManagePage'));
const MatchesManagePage = lazy(() => import('./pages/admin/MatchesManagePage'));
const UsersManagePage = lazy(() => import('./pages/admin/UsersManagePage'));
const QueuesPage = lazy(() => import('./pages/admin/QueuesPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const AgentChatPage = lazy(() => import('./pages/admin/AgentChatPage'));
const DevlogPage = lazy(() => import('./pages/admin/DevlogPage'));
const OutreachPage = lazy(() => import('./pages/admin/OutreachPage'));
const AiSettingsPage = lazy(() => import('./pages/admin/AiSettingsPage'));
const ExternalAgentsPage = lazy(() => import('./pages/admin/ExternalAgentsPage'));
const InquiriesPage = lazy(() => import('./pages/admin/InquiriesPage'));
// 웹 전용 개발 페이지 — lazy 로드
const CapturePortraitsPage = lazy(() => import('./pages/CapturePortraitsPage'));
const CaptureHeimiPage = lazy(() => import('./pages/CaptureHeimiPage'));

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const { user, loading, login, register, logout, updateUser } = useAuth();
  useNativeOAuth(updateUser);
  const [partnershipOpen, setPartnershipOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const location = useLocation();

  // 페이지 전환 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // ?ref= 파라미터를 sessionStorage에 저장하고 URL에서 제거
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref && /^[A-Z2-9]{8}$/.test(ref)) {
      sessionStorage.setItem('referralCode', ref);
      params.delete('ref');
      const newSearch = params.toString();
      const newUrl = location.pathname + (newSearch ? `?${newSearch}` : '') + location.hash;
      window.history.replaceState(null, '', newUrl);
    }
  // 마운트 시 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">{t('loading')}</div>
      </div>
    );
  }

  return (
    <XpToastProvider>
    <PullToRefreshProvider>
    <Suspense fallback={<PageSpinner />}>
    <Routes>
      {/* 관리자 전용 라우트 — 별도 레이아웃 */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin/*"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="reports" element={<ReportsManagePage />} />
        <Route path="matches" element={<MatchesManagePage />} />
        <Route path="users" element={<UsersManagePage />} />
        <Route path="queues" element={<QueuesPage />} />
        <Route path="audit-logs" element={<AuditLogPage />} />
        <Route path="agent" element={<AgentChatPage />} />
        <Route path="devlog" element={<DevlogPage />} />
        <Route path="outreach" element={<OutreachPage />} />
        <Route path="ai-settings" element={<AiSettingsPage />} />
        <Route path="external-agents" element={<ExternalAgentsPage />} />
        <Route path="inquiries" element={<InquiriesPage />} />
      </Route>

      {/* 일반 사용자 라우트 — 공통 Header/Footer */}
      <Route
        path="*"
        element={
          <div className="min-h-screen bg-gray-50 flex flex-col">
            <Header user={user} onLogout={logout} />
            <PullToRefreshContainer
              key={location.pathname}
              className="flex-1 pb-20 md:pb-0 animate-page-in"
            >
              <Routes>
                {userRoutes({ user, login, register, updateUser }).map(({ path, element }) => (
                  <Route key={path} path={path} element={element} />
                ))}
                {/* 웹 전용 개발 라우트 */}
                <Route path="/dev/portraits" element={<CapturePortraitsPage />} />
                <Route path="/dev/capture-heimi" element={<CaptureHeimiPage />} />
              </Routes>
            </PullToRefreshContainer>
            <footer className="hidden md:block bg-gray-100 border-t border-gray-200 py-6 mt-12">
              <div className="max-w-5xl mx-auto px-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('footer')}</span>
                  <div className="flex items-center gap-3">
                    <a
                      href="/devlog"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:shadow-sm transition-all duration-150 cursor-pointer"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                      {t('nav.devlog')}
                    </a>
                    <a
                      href="https://x.com/yoooonion"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:shadow-sm transition-all duration-150 cursor-pointer"
                      aria-label="Twitter"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div className="space-y-0.5">
                    <p>운영: 주식회사 슈퍼빌랩스 (Supervlabs Inc.) | 사업자등록번호: 856-87-02886 | <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 transition-colors">Privacy Policy</a></p>
                    <p>대표: 이성준, 고정환 | 이메일: contact@supervlabs.io</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPartnershipOpen(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:shadow-sm transition-all duration-150 whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    {t('inquiry.partnership')}
                  </button>
                </div>
              </div>
            </footer>
            {toast && (
              <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in whitespace-nowrap">
                {toast}
              </div>
            )}
            <InquiryModal
              open={partnershipOpen}
              onClose={() => setPartnershipOpen(false)}
              fixedCategory="PARTNERSHIP"
              titleKey="inquiry.partnershipTitle"
              onSuccess={() => {
                setToast(t('inquiry.success'));
                setTimeout(() => setToast(null), 3500);
              }}
            />
            <BottomTab />
            <AgentChatWidget />
          </div>
        }
      />
    </Routes>
    </Suspense>
    </PullToRefreshProvider>
    </XpToastProvider>
  );
}
