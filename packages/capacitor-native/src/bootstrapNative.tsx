import React from 'react';
import type { Root } from 'react-dom/client';
import type { i18n as I18nInstance } from 'i18next';
import type { ImageSpec } from 'capacitor-native-navigation';

export interface TabConfig {
  titleKey: string;
  path: string;
  image?: ImageSpec;
}

const DEFAULT_TABS: TabConfig[] = [
  { titleKey: 'nav.home', path: '/', image: '/icon/tab-home.svg' },
  { titleKey: 'nav.team', path: '/team', image: '/icon/tab-search.svg' },
  { titleKey: 'nav.sighting', path: '/sightings/new', image: '/icon/tab-camera.svg' },
  { titleKey: 'nav.community', path: '/community', image: '/icon/tab-chat.svg' },
  { titleKey: 'nav.profile', path: '/profile', image: '/icon/tab-user.svg' },
];

export interface BootstrapOptions {
  root: Root;
  i18n: I18nInstance;
  /** NativeNavigationRouter의 children으로 렌더될 React 엘리먼트 */
  appElement: React.ReactElement;
  /** 탭 구성 오버라이드 (기본: 홈/찾기/신고/커뮤니티/프로필) */
  tabs?: TabConfig[];
}

export async function bootstrapNative(options: BootstrapOptions): Promise<void> {
  const { root, i18n, appElement, tabs = DEFAULT_TABS } = options;

  const { NativeNavigation } = await import('capacitor-native-navigation');
  const { initReact, NativeNavigationProvider } = await import('capacitor-native-navigation-react');
  const { NativeNavigationRouter } = await import('capacitor-native-navigation-react-router');

  const nn = initReact({ plugin: NativeNavigation });

  // URL 스킴 수신 — OAuth 콜백 토큰 처리 + SFSafariViewController 닫기
  const { App: CapApp } = await import('@capacitor/app');
  let oauthHandled = false;
  void CapApp.addListener('appUrlOpen', async (data: { url: string }) => {
    if (oauthHandled) return;
    try {
      const url = new URL(data.url);
      if (url.pathname !== '/auth/callback') return;
      const token = new URLSearchParams(url.hash.slice(1)).get('token');
      if (!token) return;

      oauthHandled = true;

      // 토큰 저장
      localStorage.setItem('ft_token', token);

      // SFSafariViewController 닫기
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.close();
      } catch { /* ignore */ }

      // 플래그 리셋 (재로그인 대비)
      setTimeout(() => { oauthHandled = false; }, 1000);

      // 홈으로 이동
      window.location.replace('/');
    } catch { /* invalid URL — ignore */ }
  });

  await NativeNavigation.present({
    component: {
      type: 'tabs',
      tabs: tabs.map((tab) => ({
        title: i18n.t(tab.titleKey),
        image: tab.image,
        component: { type: 'stack' as const, components: [{ type: 'view' as const, path: tab.path }] },
      })),
    },
  });

  root.render(
    <React.StrictMode>
      <NativeNavigationProvider value={nn}>
        <NativeNavigationRouter>
          {appElement}
        </NativeNavigationRouter>
      </NativeNavigationProvider>
    </React.StrictMode>,
  );
}
