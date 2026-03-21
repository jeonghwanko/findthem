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
    // capacitor-native-navigation은 현재 크래시 유발하여 제외 — 웹 BrowserRouter 폴백 사용
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
  server: {
    // 네이티브 빌드가 아닌 경우 원격 서버 사용 (개발/웹 모드)
    ...(useRemoteServer && {
      url: process.env['CAPACITOR_SERVER_URL'] ?? 'https://union.pryzm.gg',
      cleartext: false,
    }),
    // OAuth 리다이렉트를 WebView 내에서 처리 (외부 브라우저로 이탈 방지)
    allowNavigation: [
      'union.pryzm.gg',
      'kauth.kakao.com',
      'accounts.kakao.com',
      'nid.naver.com',
      'oauth.telegram.org',
      'appleid.apple.com',
    ],
  },
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
