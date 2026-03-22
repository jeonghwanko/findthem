import { useState, useCallback, useRef, useEffect } from 'react';
import { IAPAdapter, isIAPUserCancelled } from '../adapters/IAPAdapter.js';
import type { PaymentProduct, PurchaseResult } from '../types.js';
import { detectPlatform } from '../platform.js';

export interface UseIAPOptions {
  productIds: string[];
  /** 구매 성공 콜백. async 함수도 지원 (서버 검증 등) */
  onSuccess?: (result: PurchaseResult) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface UseIAPResult {
  products: PaymentProduct[];
  loading: boolean;
  purchasing: boolean;
  error: string | null;
  purchase: (product: PaymentProduct) => Promise<void>;
}

export function useIAP({ productIds, onSuccess, onError }: UseIAPOptions): UseIAPResult {
  const [products, setProducts] = useState<PaymentProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 더블클릭 방지 (useRewardAd.ts와 동일한 패턴)
  const isPayingRef = useRef(false);
  const adapterRef = useRef<IAPAdapter | null>(null);

  const getAdapter = useCallback(() => {
    if (!adapterRef.current) {
      adapterRef.current = new IAPAdapter();
    }
    return adapterRef.current;
  }, []);

  // 컴포넌트 마운트 시 제품 목록 로드 (네이티브에서만)
  useEffect(() => {
    const platform = detectPlatform();
    if (platform === 'web') return;

    setLoading(true);
    setError(null);
    getAdapter()
      .getProducts(productIds)
      .then(setProducts)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
        setError(msg);
      })
      .finally(() => setLoading(false));
    // productIds는 상수 배열이므로 stringify로 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAdapter, JSON.stringify(productIds)]);

  const purchase = useCallback(
    async (product: PaymentProduct) => {
      if (isPayingRef.current) return;
      isPayingRef.current = true;
      setPurchasing(true);
      setError(null);

      try {
        const result = await getAdapter().purchase(product);
        await onSuccess?.(result);
      } catch (err: unknown) {
        // 사용자 취소는 조용히 처리
        if (isIAPUserCancelled(err)) return;
        const msg = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
        setError(msg);
        onError?.(err instanceof Error ? err : new Error(msg));
      } finally {
        isPayingRef.current = false;
        setPurchasing(false);
      }
    },
    [getAdapter, onSuccess, onError],
  );

  return { products, loading, purchasing, error, purchase };
}
