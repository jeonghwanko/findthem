/**
 * 공통 사용자 라우트 정의 — App.tsx(웹)과 NativeApp.tsx(네이티브) 모두에서 사용.
 * 라우트 추가 시 이 파일만 수정하면 양쪽에 반영됨.
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { User } from '../api/client';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import BrowsePage from '../pages/BrowsePage';
import RegisterReportPage from '../pages/RegisterReportPage';
import ReportDetailPage from '../pages/ReportDetailPage';
import SightingSubmitPage from '../pages/SightingSubmitPage';
import SightingDetailPage from '../pages/SightingDetailPage';
import TeamPage from '../pages/TeamPage';
import SponsorPage from '../pages/SponsorPage';
import SponsorSuccessPage from '../pages/SponsorSuccessPage';
import MyReportsPage from '../pages/MyReportsPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import CommunityPage from '../pages/CommunityPage';
import CommunityPostPage from '../pages/CommunityPostPage';
import CommunityNewPostPage from '../pages/CommunityNewPostPage';
import CommunityEditPostPage from '../pages/CommunityEditPostPage';
import ProfilePage from '../pages/ProfilePage';
import PrivacyPolicyPage from '../pages/PrivacyPolicyPage';
import GamePage from '../pages/GamePage';

interface RouteEntry {
  path: string;
  element: ReactNode;
}

interface UserRoutesContext {
  user: User | null;
  login: (phone: string, password: string) => Promise<User>;
  register: (name: string, phone: string, password: string) => Promise<User>;
  updateUser: (user: User) => void;
}

export function userRoutes(ctx: UserRoutesContext): RouteEntry[] {
  const { user, login, register, updateUser } = ctx;

  return [
    { path: '/', element: <HomePage /> },
    {
      path: '/login',
      element: user ? <Navigate to="/" /> : <LoginPage onLogin={login} onRegister={register} />,
    },
    { path: '/browse', element: <BrowsePage /> },
    {
      path: '/profile',
      element: user ? <ProfilePage user={user} onUserUpdate={updateUser} /> : <Navigate to="/login" />,
    },
    {
      path: '/my-reports',
      element: user ? <MyReportsPage /> : <Navigate to="/login" />,
    },
    {
      path: '/reports/new',
      element: user ? <RegisterReportPage /> : <Navigate to="/login" />,
    },
    { path: '/reports/:id', element: <ReportDetailPage /> },
    { path: '/sightings/new', element: <SightingSubmitPage /> },
    { path: '/sightings/:id', element: <SightingDetailPage /> },
    { path: '/auth/callback', element: <AuthCallbackPage /> },
    { path: '/community', element: <CommunityPage /> },
    {
      path: '/community/new',
      element: user ? <CommunityNewPostPage /> : <Navigate to="/login" />,
    },
    { path: '/community/:id', element: <CommunityPostPage /> },
    {
      path: '/community/:id/edit',
      element: user ? <CommunityEditPostPage /> : <Navigate to="/login" />,
    },
    { path: '/privacy', element: <PrivacyPolicyPage /> },
    { path: '/game', element: <GamePage /> },
    { path: '/team', element: <TeamPage /> },
    { path: '/team/sponsor/success', element: <SponsorSuccessPage /> },
    { path: '/team/sponsor/:agentId', element: <SponsorPage /> },
  ];
}
