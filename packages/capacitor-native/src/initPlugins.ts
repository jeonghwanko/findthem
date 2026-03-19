import { Capacitor } from '@capacitor/core';

export interface InitNativePluginsOptions {
  /** AdMob 테스트 모드 (개발 환경에서 true) */
  adMobTesting?: boolean;
}

/**
 * Capacitor 네이티브 플러그인 초기화 (StatusBar, SplashScreen, AdMob).
 * Firebase 플러그인은 앱 레벨에서 별도 초기화 (루트 의존성).
 */
export async function initNativePlugins(opts?: InitNativePluginsOptions): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const [{ StatusBar }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  await StatusBar.setOverlaysWebView({ overlay: true });
  await SplashScreen.hide();

  try {
    const { AdMob } = await import('@capacitor-community/admob');
    await AdMob.initialize({ initializeForTesting: opts?.adMobTesting ?? false });
  } catch {
    // AdMob 플러그인 미설치 환경에서는 무시
  }
}

/** OTA 업데이트 후 앱이 정상 동작함을 알려 롤백 방지. 렌더링 완료 후 호출. */
export async function notifyOtaReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // 무시
  }
}
