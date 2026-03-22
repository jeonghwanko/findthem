import type { IAPProduct as NativeIAPProduct } from '@findthem/capacitor-iap';
export { isIAPUserCancelled } from '@findthem/capacitor-iap';
import type { PaymentAdapter, PaymentProduct, PurchaseResult } from '../types.js';
import { detectPlatform } from '../platform.js';

/**
 * @findthem/capacitor-iap 기반 IAP Adapter
 * iOS: StoreKit 2 | Android: Google Play Billing 7.x
 *
 * RevenueCat을 사용하지 않고 App Store / Google Play와 직접 통신합니다.
 * 영수증 검증은 서버(iapVerifyService.ts)에서 Apple/Google API로 수행합니다.
 */
export class IAPAdapter implements PaymentAdapter {
  async getProducts(productIds: string[]): Promise<PaymentProduct[]> {
    const { CapacitorIAP } = await import('@findthem/capacitor-iap');
    const { products } = await CapacitorIAP.getProducts({ productIds });
    return products.map((p: NativeIAPProduct) => ({
      id:             p.id,
      price:          p.price,
      currency:       p.currencyCode,
      localizedPrice: p.localizedPrice,
      title:          p.title,
    }));
  }

  async purchase(product: PaymentProduct): Promise<PurchaseResult> {
    const { CapacitorIAP } = await import('@findthem/capacitor-iap');
    const result = await CapacitorIAP.purchase({ productId: product.id });
    return {
      transactionId: result.transactionId,
      productId:     result.productId,
      platform:      detectPlatform() as 'ios' | 'android',
      purchaseToken: result.purchaseToken,
    };
  }
}

