import { registerPlugin } from '@capacitor/core';
import type { CapacitorIAPPlugin } from './definitions.js';

const CapacitorIAP = registerPlugin<CapacitorIAPPlugin>('CapacitorIAP', {
  web: () => import('./web.js').then((m) => new m.CapacitorIAPWeb()),
});

export * from './definitions.js';
export { CapacitorIAP };

/**
 * IAP 사용자 취소 여부 확인
 * iOS: StoreKit .userCancelled
 * Android: BillingResponseCode.USER_CANCELED (코드 1)
 */
export function isIAPUserCancelled(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toUpperCase();
  return (
    msg === 'USER_CANCELLED' ||
    msg.includes('USER_CANCEL') ||
    msg.includes('USER CANCEL')
  );
}
