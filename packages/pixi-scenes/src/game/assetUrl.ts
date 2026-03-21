/**
 * Capacitor 호환 에셋 URL 생성
 *
 * Capacitor WebView(capacitor://localhost)에서 `/path`가
 * `capacitor://path`로 잘못 해석되는 문제를 방지하기 위해
 * origin을 포함한 절대 URL을 반환한다.
 */
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const BASE_URL: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (import.meta as any)?.env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
})();

export function assetUrl(path: string): string {
  return `${ORIGIN}${BASE_URL}${path.replace(/^\//, '')}`;
}

export const IS_NATIVE = typeof window !== 'undefined' &&
  (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:');
