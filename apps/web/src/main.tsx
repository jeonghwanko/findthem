import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import Web3Provider from './providers/Web3Provider';
import './index.css';
import { initCapacitorPlugins } from './bootstrap/initCapacitorPlugins';

initCapacitorPlugins().catch(() => {
  // 네이티브 환경이 아닌 경우 무시
});

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Web3Provider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Web3Provider>
  </React.StrictMode>,
);
