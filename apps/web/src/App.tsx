import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import BrowsePage from './pages/BrowsePage';
import RegisterReportPage from './pages/RegisterReportPage';
import ReportDetailPage from './pages/ReportDetailPage';
import SightingSubmitPage from './pages/SightingSubmitPage';
import ChatWidget from './components/ChatWidget';

export default function App() {
  const { user, loading, login, register, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={logout} />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/login"
            element={
              user ? <Navigate to="/" /> : <LoginPage onLogin={login} onRegister={register} />
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

      <footer className="bg-gray-100 border-t border-gray-200 py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          찾아줘 - AI 기반 실종자/반려동물 찾기 서비스
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
