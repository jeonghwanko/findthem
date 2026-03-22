import type { JSX } from 'react';
import { detectPlatform } from '../platform.js';
import { useIAP } from './useIAP.js';
import type { PaymentProduct, PurchaseResult } from '../types.js';

export interface IAPRenderProps {
  products: PaymentProduct[];
  purchase: (product: PaymentProduct) => Promise<void>;
  loading: boolean;
  purchasing: boolean;
  error: string | null;
}

export interface PaymentRouterProps {
  /** 로드할 스토어 제품 ID 목록 */
  productIds: string[];
  /** 네이티브(iOS/Android) 앱에서 렌더링할 UI */
  renderIAP: (props: IAPRenderProps) => JSX.Element | null;
  /** 웹에서 렌더링할 UI (기존 Toss + Web3) */
  renderWeb: () => JSX.Element | null;
  /** 구매 성공 콜백 */
  onSuccess?: (result: PurchaseResult) => void | Promise<void>;
  /** 구매 실패 콜백 */
  onError?: (error: Error) => void;
}

/**
 * 플랫폼을 자동 감지하여 올바른 결제 UI를 렌더링하는 라우터 컴포넌트
 *
 * - iOS / Android → renderIAP (Apple IAP / Google Play Billing)
 * - 웹             → renderWeb (Toss 카드 + Web3 지갑)
 */
export function PaymentRouter({
  productIds,
  renderIAP,
  renderWeb,
  onSuccess,
  onError,
}: PaymentRouterProps) {
  const platform = detectPlatform();

  // useIAP는 항상 호출 (React 훅 규칙 준수).
  // 내부에서 platform === 'web' 이면 제품 로드 스킵.
  const { products, loading, purchasing, error, purchase } = useIAP({
    productIds,
    onSuccess,
    onError,
  });

  if (platform !== 'web') {
    return renderIAP({ products, purchase, loading, purchasing, error }) ?? null;
  }

  return renderWeb() ?? null;
}
