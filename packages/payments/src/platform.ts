import { Capacitor } from '@capacitor/core';

export type Platform = 'ios' | 'android' | 'web';

/** 현재 실행 플랫폼 반환. 웹/PWA는 'web', 네이티브 앱은 'ios' | 'android' */
export function detectPlatform(): Platform {
  if (!Capacitor.isNativePlatform()) return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'web';
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
