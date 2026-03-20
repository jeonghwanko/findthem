import type { CapacitorConfig } from '@capacitor/cli';

const useRemoteServer = process.env['BUILD_TARGET'] !== 'native';

const config: CapacitorConfig = {
  appId: 'gg.pryzm.union',
  appName: 'FindThem',
  webDir: 'dist',
  ios: {
    // AdMob 제외 (iOS 13 지원 위해 — AdMob은 iOS 16+ 필요)
    includePlugins: [
      '@capacitor/keyboard',
      '@capacitor/splash-screen',
      '@capacitor/status-bar',
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
      launchAutoHide: true,
      launchShowDuration: 1000,
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
      },
    },
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
    },
  },
};

export default config;
