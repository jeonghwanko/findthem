import { expect, vi, afterEach, beforeAll } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
import { cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from '../src/locales/ko/translation.json';

// i18n 동기 초기화 (테스트 환경용)
beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: 'ko',
      fallbackLng: 'ko',
      resources: { ko: { translation: ko } },
      interpolation: { escapeValue: false },
    });
  }
});

// 각 테스트 후 DOM 정리
afterEach(() => {
  cleanup();
});

// ── localStorage Mock ──
const localStorageMock: Storage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// ── fetch Mock ──
globalThis.fetch = vi.fn();
