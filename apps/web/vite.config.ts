import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
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
    dedupe: ['@aptos-labs/ts-sdk'],
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
