/**
 * 네이티브(Capacitor) 환경에서 window.location.origin이 capacitor://localhost를 반환하므로,
 * 공유/결제/OAuth 등 외부 서비스에 전달할 실제 웹 URL이 필요할 때 이 함수를 사용한다.
 */
import { Capacitor } from '@capacitor/core';

const WEB_ORIGIN = import.meta.env.VITE_WEB_ORIGIN ?? 'https://union.pryzm.gg';

export function getWebOrigin(): string {
  return WEB_ORIGIN;
}

// iOS: capacitor://localhost, Android: http://localhost — 프로토콜 체크 대신 Capacitor API 사용
export const IS_NATIVE = Capacitor.isNativePlatform();

/** 상대 경로 이미지 URL을 절대 URL로 변환 (네이티브 앱에서 /uploads/ 경로 해석 문제 방지) */
export function assetSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (!IS_NATIVE) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${WEB_ORIGIN}${url}`;
}
