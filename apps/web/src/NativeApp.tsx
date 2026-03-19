/**
 * NativeApp — capacitor-native-navigation 전용 라우트 정의
 *
 * NativeNavigationRouter가 각 네이티브 뷰의 path에 매칭되는 Route를 찾아 렌더링.
 * 탭 바는 네이티브가 담당하므로 BottomTab/Footer 불필요.
 * React Router <Link>와 navigate()는 NativeNavigationRouter가 네이티브 push/pop으로 변환.
 *
 * NativeNavigationRouter 내부에서는 Route fragment만 반환해야 함.
 * loading 스피너는 각 페이지 컴포넌트 내부에서 처리.
 */
import './i18n';
import { Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { userRoutes } from './routes/userRoutes';

export default function NativeApp() {
  const { user, login, register, updateUser } = useAuth();

  return (
    <>
      {userRoutes({ user, login, register, updateUser }).map(({ path, element }) => (
        <Route key={path} path={path} element={element} />
      ))}
    </>
  );
}
