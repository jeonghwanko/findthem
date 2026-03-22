/**
 * 공통 사용자 라우트 정의 — App.tsx(웹)과 NativeApp.tsx(네이티브) 모두에서 사용.
 * 라우트 추가 시 이 파일만 수정하면 양쪽에 반영됨.
 */
import { lazy, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { User } from '../api/client';
// HomePage는 첫 진입 페이지이므로 즉시 로드
import HomePage from '../pages/HomePage';

const LoginPage = lazy(() => import('../pages/LoginPage'));
const BrowsePage = lazy(() => import('../pages/BrowsePage'));
const RegisterReportPage = lazy(() => import('../pages/RegisterReportPage'));
const ReportDetailPage = lazy(() => import('../pages/ReportDetailPage'));
const SightingSubmitPage = lazy(() => import('../pages/SightingSubmitPage'));
const SightingDetailPage = lazy(() => import('../pages/SightingDetailPage'));
// TeamPage: Pixi.js 씬 포함으로 무거움
const TeamPage = lazy(() => import('../pages/TeamPage'));
// SponsorPage: wagmi/viem 포함으로 무거움
const SponsorPage = lazy(() => import('../pages/SponsorPage'));
const SponsorSuccessPage = lazy(() => import('../pages/SponsorSuccessPage'));
const MyReportsPage = lazy(() => import('../pages/MyReportsPage'));
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage'));
const CommunityPage = lazy(() => import('../pages/CommunityPage'));
const CommunityPostPage = lazy(() => import('../pages/CommunityPostPage'));
const CommunityNewPostPage = lazy(() => import('../pages/CommunityNewPostPage'));
const CommunityEditPostPage = lazy(() => import('../pages/CommunityEditPostPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const PrivacyPolicyPage = lazy(() => import('../pages/PrivacyPolicyPage'));
// GamePage: 게임 로직 포함으로 무거움
const GamePage = lazy(() => import('../pages/GamePage'));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'));

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
    { path: '/notifications', element: <NotificationsPage /> },
    { path: '/privacy', element: <PrivacyPolicyPage /> },
    { path: '/game', element: <GamePage /> },
    { path: '/team', element: <TeamPage /> },
    { path: '/team/sponsor/success', element: <SponsorSuccessPage /> },
    { path: '/team/sponsor/:agentId', element: <SponsorPage /> },
  ];
}
