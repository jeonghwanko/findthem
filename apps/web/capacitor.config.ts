import type { CapacitorConfig } from '@capacitor/cli';

const useRemoteServer = process.env['BUILD_TARGET'] !== 'native';

const config: CapacitorConfig = {
  appId: 'gg.pryzm.union',
  appName: 'FindThem',
  webDir: 'dist',
  ios: {
    // iOS 16.0+ — AdMob, Firebase 포함
    // @capacitor-firebase/analytics는 Podfile에서 직접 /Analytics subspec으로 고정
    // (cap sync가 subspec을 제거하는 문제 방지)
    includePlugins: [
      '@capacitor/app',
      '@capacitor/browser',
      '@capacitor/keyboard',
      '@capacitor/splash-screen',
      '@capacitor/status-bar',
      '@capacitor-community/admob',
      '@capacitor-firebase/crashlytics',
      '@capacitor-firebase/messaging',
    ],
  },
  ...(useRemoteServer && {
    server: {
      url: process.env['CAPACITOR_SERVER_URL'] ?? 'https://union.pryzm.gg',
      cleartext: false,
    },
  }),
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // 코드에서 수동 숨김 (렌더 완료 후)
      backgroundColor: '#ffffff',
    },
    StatusBar: {
      style: 'Default',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'body',
    },
    AdMob: {
      appId: {
        android: 'ca-app-pub-3320768302064088~3216379440',
        ios: 'ca-app-pub-3320768302064088~1876982270',
      },
    },
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
    },
  },
};

export default config;
