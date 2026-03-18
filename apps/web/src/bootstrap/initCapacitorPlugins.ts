import { Capacitor } from '@capacitor/core';

export async function initCapacitorPlugins(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const [{ StatusBar }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  await StatusBar.setOverlaysWebView({ overlay: true });
  await SplashScreen.hide();

  // AdMob 초기화 (네이티브 앱에서만)
  try {
    const { AdMob } = await import('@capacitor-community/admob');
    await AdMob.initialize({ initializeForTesting: import.meta.env.DEV });
  } catch {
    // AdMob 플러그인 미설치 환경에서는 무시
  }

  // Firebase Analytics 초기화
  try {
    const { FirebaseAnalytics } = await import('@capacitor-firebase/analytics');
    await FirebaseAnalytics.setEnabled({ enabled: true });
  } catch {
    // 무시
  }

  // Firebase Crashlytics 초기화
  try {
    const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
    await FirebaseCrashlytics.setEnabled({ enabled: true });
  } catch {
    // 무시
  }

  // FCM 푸시 알림 초기화
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.requestPermissions();
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      // 토큰을 로컬스토리지에 저장 (로그인 후 서버에 등록)
      localStorage.setItem('fcm_token', token);
    }
  } catch {
    // 무시
  }
}
