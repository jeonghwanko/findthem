import './i18n';
import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import Header from './components/Header';
import LanguageSwitcher from './components/LanguageSwitcher';
import BottomTab from './components/BottomTab';
import AgentChatWidget from './components/AgentChatWidget';
import InquiryModal from './components/InquiryModal';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './pages/admin/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import ReportsManagePage from './pages/admin/ReportsManagePage';
import MatchesManagePage from './pages/admin/MatchesManagePage';
import UsersManagePage from './pages/admin/UsersManagePage';
import QueuesPage from './pages/admin/QueuesPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import AgentChatPage from './pages/admin/AgentChatPage';
import DevlogPage from './pages/admin/DevlogPage';
import OutreachPage from './pages/admin/OutreachPage';
import AiSettingsPage from './pages/admin/AiSettingsPage';
import ExternalAgentsPage from './pages/admin/ExternalAgentsPage';
import InquiriesPage from './pages/admin/InquiriesPage';
import CapturePortraitsPage from './pages/CapturePortraitsPage';
import CaptureHeimiPage from './pages/CaptureHeimiPage';
import { userRoutes } from './routes/userRoutes';

export default function App() {
  const { user, loading, login, register, logout, updateUser } = useAuth();
  const { t } = useTranslation();
  const [partnershipOpen, setPartnershipOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">{t('loading')}</div>
      </div>
    );
  }

  return (
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
            <main className="flex-1 pb-20 md:pb-0">
              <Routes>
                {userRoutes({ user, login, register, updateUser }).map(({ path, element }) => (
                  <Route key={path} path={path} element={element} />
                ))}
                {/* 웹 전용 개발 라우트 */}
                <Route path="/dev/portraits" element={<CapturePortraitsPage />} />
                <Route path="/dev/capture-heimi" element={<CaptureHeimiPage />} />
              </Routes>
            </main>
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
                    <LanguageSwitcher variant="light" />
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
            <BottomTab user={user} />
            <AgentChatWidget />
          </div>
        }
      />
    </Routes>
  );
}
