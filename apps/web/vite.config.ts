import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 네이티브 빌드 시 웹 전용 이미지를 dist/에서 제거 (APK 용량 절감)
function nativeAssetCleanupPlugin(mode: string): Plugin {
  return {
    name: 'native-asset-cleanup',
    apply: 'build',
    closeBundle() {
      if (mode !== 'native') return;
      const targets = [
        'dist/spine/human_type.webp',
        'dist/spine/human_type_2.webp',
        'dist/spine/human_type_3.webp',
        'dist/pwa-192x192.png',
        'dist/pwa-512x512.png',
        'dist/og-hero.png',
      ];
      for (const f of targets) {
        const full = path.resolve(f);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    nativeAssetCleanupPlugin(mode),
    ...(mode !== 'native'
      ? [
          VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
            manifest: {
              name: 'FindThem — 실종 신고 플랫폼',
              short_name: 'FindThem',
              description: '반려동물을 찾는 AI 기반 플랫폼',
              theme_color: '#2563eb',
              background_color: '#f9fafb',
              display: 'standalone',
              orientation: 'portrait',
              scope: '/',
              start_url: '/',
              icons: [
                {
                  src: 'pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            },
            injectManifest: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
              globIgnores: ['spine/**', 'stair/**'],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
            },
          }),
        ]
      : []),
  ],
  resolve: {
    dedupe: ['@aptos-labs/ts-sdk', '@telegram-apps/bridge'],
  },
  optimizeDeps: {
    include: [
      'pixi.js',
      '@esotericsoftware/spine-pixi-v8',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pixi-spine': ['pixi.js', '@esotericsoftware/spine-pixi-v8'],
          'web3': ['wagmi', 'viem', '@rainbow-me/rainbowkit', '@tanstack/react-query'],
          'aptos': ['@aptos-labs/wallet-adapter-react', '@aptos-labs/ts-sdk'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
}));
