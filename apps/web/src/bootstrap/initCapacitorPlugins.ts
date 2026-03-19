import { FCM_TOKEN_STORAGE_KEY } from '@findthem/shared';
import { initNativePlugins } from '@findthem/capacitor-native';

export { notifyOtaReady } from '@findthem/capacitor-native';

/**
 * Capacitor 플러그인 초기화: 네이티브 플러그인 + Firebase.
 * Firebase 플러그인은 루트 의존성이므로 여기서 직접 초기화.
 */
export async function initCapacitorPlugins(): Promise<void> {
  // 네이티브 기본 플러그인 (StatusBar, SplashScreen, AdMob)
  await initNativePlugins({ adMobTesting: import.meta.env.DEV });

  // Firebase는 Capacitor.isNativePlatform() 내부에서만 동작
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;

  // Firebase Analytics
  try {
    const { FirebaseAnalytics } = await import('@capacitor-firebase/analytics');
    await FirebaseAnalytics.setEnabled({ enabled: true });
  } catch {
    // 무시
  }

  // Firebase Crashlytics
  try {
    const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
    await FirebaseCrashlytics.setEnabled({ enabled: true });
  } catch {
    // 무시
  }

  // FCM 푸시 알림
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const { receive } = await FirebaseMessaging.requestPermissions();
    if (receive === 'granted') {
      const { token } = await FirebaseMessaging.getToken();
      if (token) localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // 무시
  }
}
