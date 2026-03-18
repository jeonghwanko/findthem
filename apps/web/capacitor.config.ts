import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.findthem.app',
  appName: 'FindThem',
  webDir: 'dist',
  server: {
    url: process.env['CAPACITOR_SERVER_URL'] ?? 'https://union.pryzm.gg',
    cleartext: false,
  },
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
  },
};

export default config;
