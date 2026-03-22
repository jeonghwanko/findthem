export interface IAPProduct {
  /** 스토어 제품 ID (예: 'sponsor_tier_1') */
  id: string;
  /** 제품 표시 이름 */
  title: string;
  /** 제품 설명 */
  description: string;
  /** 가격 (소수점 포함, 플랫폼 통화 기준) */
  price: number;
  /** OS가 반환한 현지화 가격 문자열 (예: '₩1,000', '$0.99') */
  localizedPrice: string;
  /** 통화 코드 (예: 'KRW', 'USD') */
  currencyCode: string;
}

export interface IAPPurchaseResult {
  /**
   * iOS: StoreKit transactionID (uint64 → string)
   * Android: Google Play orderId (예: 'GPA.1234-5678-9012-34567')
   */
  transactionId: string;
  /** 구매한 제품 ID */
  productId: string;
  /** 결제 플랫폼 */
  platform: 'ios' | 'android';
  /**
   * Android 전용: Google Play purchaseToken.
   * 서버 영수증 검증(Google Play Developer API)에 필수.
   */
  purchaseToken?: string;
}

export interface CapacitorIAPPlugin {
  /**
   * App Store / Google Play에서 제품 정보를 조회합니다.
   * @param options.productIds 조회할 제품 ID 배열
   */
  getProducts(options: { productIds: string[] }): Promise<{ products: IAPProduct[] }>;

  /**
   * 제품 구매를 시작합니다.
   * 사용자가 취소한 경우 'USER_CANCELLED' 에러를 throw합니다.
   * @param options.productId 구매할 제품 ID
   */
  purchase(options: { productId: string }): Promise<IAPPurchaseResult>;

  /**
   * 이전 구매를 복원합니다.
   */
  restorePurchases(): Promise<{ purchases: IAPPurchaseResult[] }>;
}
