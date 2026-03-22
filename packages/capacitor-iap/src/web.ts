import { WebPlugin } from '@capacitor/core';
import type { CapacitorIAPPlugin, IAPProduct, IAPPurchaseResult } from './definitions.js';

/**
 * 웹 환경 스텁 — IAP는 네이티브 앱에서만 동작합니다.
 * 웹에서는 Toss / 크립토 결제를 사용하세요.
 */
export class CapacitorIAPWeb extends WebPlugin implements CapacitorIAPPlugin {
  async getProducts(_options: { productIds: string[] }): Promise<{ products: IAPProduct[] }> {
    throw this.unavailable('In-App Purchases are not available on web.');
  }

  async purchase(_options: { productId: string }): Promise<IAPPurchaseResult> {
    throw this.unavailable('In-App Purchases are not available on web.');
  }

  async restorePurchases(): Promise<{ purchases: IAPPurchaseResult[] }> {
    throw this.unavailable('In-App Purchases are not available on web.');
  }
}
