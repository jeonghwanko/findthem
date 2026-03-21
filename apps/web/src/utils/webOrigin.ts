/**
 * 네이티브(Capacitor) 환경에서 window.location.origin이 capacitor://localhost를 반환하므로,
 * 공유/결제/OAuth 등 외부 서비스에 전달할 실제 웹 URL이 필요할 때 이 함수를 사용한다.
 */
const WEB_ORIGIN = import.meta.env.VITE_WEB_ORIGIN ?? 'https://union.pryzm.gg';

export function getWebOrigin(): string {
  return WEB_ORIGIN;
}
