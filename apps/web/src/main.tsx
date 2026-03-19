import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';
import { initCapacitorPlugins, notifyOtaReady } from './bootstrap/initCapacitorPlugins';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = ReactDOM.createRoot(document.getElementById('root')!);

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
