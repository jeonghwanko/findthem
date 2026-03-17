import './i18n';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import Header from './components/Header';
import LanguageSwitcher from './components/LanguageSwitcher';
import BottomTab from './components/BottomTab';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import BrowsePage from './pages/BrowsePage';
import RegisterReportPage from './pages/RegisterReportPage';
import ReportDetailPage from './pages/ReportDetailPage';
import SightingSubmitPage from './pages/SightingSubmitPage';
import AgentChatWidget from './components/AgentChatWidget';
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
import TeamPage from './pages/TeamPage';
import SponsorPage from './pages/SponsorPage';
import SponsorSuccessPage from './pages/SponsorSuccessPage';
import MyReportsPage from './pages/MyReportsPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import CommunityPage from './pages/CommunityPage';
import CommunityPostPage from './pages/CommunityPostPage';
import CommunityNewPostPage from './pages/CommunityNewPostPage';
import CommunityEditPostPage from './pages/CommunityEditPostPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  const { user, loading, login, register, logout, updateUser } = useAuth();
  const { t } = useTranslation();

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
      </Route>

      {/* 일반 사용자 라우트 — 공통 Header/Footer */}
      <Route
        path="*"
        element={
          <div className="min-h-screen bg-gray-50 flex flex-col">
            <Header user={user} onLogout={logout} />
            <main className="flex-1 pb-20 md:pb-0">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route
                  path="/login"
                  element={
                    user ? (
                      <Navigate to="/" />
                    ) : (
                      <LoginPage onLogin={login} onRegister={register} />
                    )
                  }
                />
                <Route path="/browse" element={<BrowsePage />} />
                <Route
                  path="/profile"
                  element={user ? <ProfilePage user={user} onUserUpdate={updateUser} /> : <Navigate to="/login" />}
                />
                <Route
                  path="/my-reports"
                  element={user ? <MyReportsPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/reports/new"
                  element={user ? <RegisterReportPage /> : <Navigate to="/login" />}
                />
                <Route path="/reports/:id" element={<ReportDetailPage />} />
                <Route path="/sightings/new" element={<SightingSubmitPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/community" element={<CommunityPage />} />
                <Route
                  path="/community/new"
                  element={user ? <CommunityNewPostPage /> : <Navigate to="/login" />}
                />
                <Route path="/community/:id" element={<CommunityPostPage />} />
                <Route
                  path="/community/:id/edit"
                  element={user ? <CommunityEditPostPage /> : <Navigate to="/login" />}
                />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/team/sponsor/success" element={<SponsorSuccessPage />} />
                <Route path="/team/sponsor/:agentId" element={<SponsorPage />} />
              </Routes>
            </main>
            <footer className="hidden md:block bg-gray-100 border-t border-gray-200 py-6 mt-12">
              <div className="max-w-5xl mx-auto px-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{t('footer')}</span>
                    <a
                      href="/devlog"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                      {t('nav.devlog')}
                    </a>
                    <a
                      href="https://x.com/yoooonion"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Twitter"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                  </div>
                  <LanguageSwitcher variant="light" />
                </div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  <p>운영: 주식회사 슈퍼빌랩스 (Supervlabs Inc.) | 사업자등록번호: 856-87-02886</p>
                  <p>대표: 이성준, 고정환 | 이메일: contact@supervlabs.io</p>
                </div>
              </div>
            </footer>
            <BottomTab user={user} />
            <AgentChatWidget />
          </div>
        }
      />
    </Routes>
  );
}
