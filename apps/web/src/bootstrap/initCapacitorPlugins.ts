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
}
