// ── 공통 결제 타입 ──
// 모든 플랫폼(iOS IAP, Android IAP, 웹 카드, 웹 크립토)의 공통 계약

export interface PaymentProduct {
  /** 스토어 제품 ID (e.g., 'sponsor_tier_1') */
  id: string;
  /** 금액 (플랫폼 기본 단위) */
  price: number;
  /** 통화 코드 (e.g., 'KRW', 'USD') */
  currency: string;
  /** OS가 반환한 현지화 가격 문자열 (e.g., '₩1,000') */
  localizedPrice: string;
  /** 제품 표시 이름 */
  title: string;
}

export interface PurchaseResult {
  /**
   * iOS: StoreKit Transaction ID (uint64 → string)
   * Android: Google Play orderId (예: 'GPA.1234-5678-9012-34567')
   */
  transactionId: string;
  /** 구매한 제품 ID */
  productId: string;
  /** 결제가 이루어진 플랫폼 */
  platform: 'ios' | 'android';
  /**
   * Android 전용: Google Play purchaseToken.
   * 서버 영수증 검증(Google Play Developer API)에 필수.
   */
  purchaseToken?: string;
  /** 플랫폼별 원본 응답 (디버그용) */
  raw?: unknown;
}

/** 모든 Adapter가 구현해야 하는 공통 인터페이스 */
export interface PaymentAdapter {
  getProducts(productIds: string[]): Promise<PaymentProduct[]>;
  purchase(product: PaymentProduct): Promise<PurchaseResult>;
}
