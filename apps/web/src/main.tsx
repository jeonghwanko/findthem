import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './i18n';
import './index.css';
import { initCapacitorPlugins, notifyOtaReady } from './bootstrap/initCapacitorPlugins';
import { NativeSplashOverlay } from './components/NativeSplashOverlay';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = ReactDOM.createRoot(document.getElementById('root')!);

// 네이티브: auth/routing 이전에 스플래시 오버레이 즉시 마운트
if (Capacitor.isNativePlatform()) {
  const splashDiv = document.createElement('div');
  document.body.appendChild(splashDiv);
  ReactDOM.createRoot(splashDiv).render(<NativeSplashOverlay />);
}

async function bootstrap() {
  await initCapacitorPlugins().catch(() => {});

  if (Capacitor.isNativePlatform()) {
    const { bootstrapNative } = await import('./bootstrap/bootstrapNative');
    await bootstrapNative(root);
  } else {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  }

  // 렌더링 완료 후 OTA 롤백 방지 신호
  void notifyOtaReady();
}

bootstrap().catch(() => {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
  void notifyOtaReady();
});
