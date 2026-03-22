/**
 * NativeApp — 네이티브 앱 전용 라우트 정의.
 *
 * bootstrapNative() 성공 시 NativeNavigationRouter 안에서 렌더됨.
 * 실패(capacitor-native-navigation 미지원) 시 main.tsx의 catch가 BrowserRouter + App으로 폴백.
 * 탭 바는 네이티브가 담당하므로 BottomTab/Footer 불필요.
 */
import { Suspense } from 'react';
import { Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { userRoutes } from './routes/userRoutes';
import { useNativeOAuth } from './hooks/useNativeOAuth';

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

export default function NativeApp() {
  const { user, login, register, updateUser } = useAuth();
  useNativeOAuth(updateUser);

  return (
    <Suspense fallback={<PageSpinner />}>
      {userRoutes({ user, login, register, updateUser }).map(({ path, element }) => (
        <Route key={path} path={path} element={element} />
      ))}
    </Suspense>
  );
}
