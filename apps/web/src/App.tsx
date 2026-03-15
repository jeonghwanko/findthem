import './i18n';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import Header from './components/Header';
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

export default function App() {
  const { user, loading, login, register, logout } = useAuth();
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
                  path="/reports/new"
                  element={user ? <RegisterReportPage /> : <Navigate to="/login" />}
                />
                <Route path="/reports/:id" element={<ReportDetailPage />} />
                <Route path="/sightings/new" element={<SightingSubmitPage />} />
              </Routes>
            </main>
            <footer className="hidden md:block bg-gray-100 border-t border-gray-200 py-6 mt-12">
              <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
                {t('footer')}
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
