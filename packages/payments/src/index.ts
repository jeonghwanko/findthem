// 공통 타입
export type {
  PaymentProduct,
  PurchaseResult,
  PaymentAdapter,
} from './types.js';

// 플랫폼 유틸
export { detectPlatform, isNativePlatform } from './platform.js';
export type { Platform } from './platform.js';

// IAP Adapter (직접 사용 시)
export { IAPAdapter, isIAPUserCancelled } from './adapters/IAPAdapter.js';
