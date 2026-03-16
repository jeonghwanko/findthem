import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUsdPerToken, _resetPriceCache } from './price-oracle.js';

// global fetch is used inside the module; vitest provides it as vi.fn() via globalThis
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function makeJsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe('getUsdPerToken', () => {
  beforeEach(() => {
    _resetPriceCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    _resetPriceCache();
  });

  // ── Stablecoins (no fetch needed) ──
  describe('스테이블코인 — 항상 1 반환', () => {
    it('USDC → 1', async () => {
      await expect(getUsdPerToken('USDC')).resolves.toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('USDT → 1', async () => {
      await expect(getUsdPerToken('USDT')).resolves.toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('소문자 usdc → 1 (대소문자 무시)', async () => {
      await expect(getUsdPerToken('usdc')).resolves.toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('소문자 usdt → 1', async () => {
      await expect(getUsdPerToken('usdt')).resolves.toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Unsupported symbol ──
  describe('지원하지 않는 심볼', () => {
    it('USDt는 .toUpperCase() → USDT → 스테이블코인으로 1 반환', async () => {
      // getUsdPerToken 내부에서 sym = symbol.toUpperCase() 처리
      // 'USDt'.toUpperCase() === 'USDT' → 스테이블코인 분기 → 1 반환
      await expect(getUsdPerToken('USDt')).resolves.toBe(1);
    });

    it('DOGE 같은 미지원 심볼 → 에러 throw', async () => {
      await expect(getUsdPerToken('DOGE')).rejects.toThrow('USD_PRICE_UNSUPPORTED_SYMBOL_DOGE');
    });

    it('XRP 미지원 심볼 → 에러 throw', async () => {
      await expect(getUsdPerToken('XRP')).rejects.toThrow('USD_PRICE_UNSUPPORTED_SYMBOL_XRP');
    });
  });

  // ── CoinGecko primary source ──
  describe('CoinGecko 기본 소스', () => {
    it('APT — CoinGecko 성공 응답 → 가격 반환', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ aptos: { usd: 8.5 } }),
      );

      const price = await getUsdPerToken('APT');
      expect(price).toBe(8.5);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain('coingecko.com');
    });

    it('ETH — CoinGecko 성공 응답 → 가격 반환', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ ethereum: { usd: 3200 } }),
      );

      const price = await getUsdPerToken('ETH');
      expect(price).toBe(3200);
    });

    it('BNB — CoinGecko 성공 응답 → 가격 반환', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ binancecoin: { usd: 600 } }),
      );

      const price = await getUsdPerToken('BNB');
      expect(price).toBe(600);
    });

    it('SOL — CoinGecko 성공 응답 → 가격 반환', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ solana: { usd: 150 } }),
      );

      const price = await getUsdPerToken('SOL');
      expect(price).toBe(150);
    });
  });

  // ── Memory cache ──
  describe('메모리 캐시 (TTL 1분)', () => {
    it('두 번째 호출 시 fetch 없이 캐시 반환', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ aptos: { usd: 9.0 } }),
      );

      const price1 = await getUsdPerToken('APT');
      const price2 = await getUsdPerToken('APT');

      expect(price1).toBe(9.0);
      expect(price2).toBe(9.0);
      // fetch는 첫 번째 호출에서만 실행됨
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('_resetPriceCache 후에는 다시 fetch 실행', async () => {
      mockFetch.mockResolvedValue(
        makeJsonResponse({ aptos: { usd: 9.0 } }),
      );

      await getUsdPerToken('APT');
      _resetPriceCache();
      await getUsdPerToken('APT');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── Binance fallback ──
  describe('Binance 폴백', () => {
    it('CoinGecko 실패 시 Binance에서 가격 조회', async () => {
      // CoinGecko: HTTP 500
      mockFetch.mockResolvedValueOnce(makeJsonResponse({}, false, 500));
      // Binance: 성공
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ price: '2500.00' }),
      );

      const price = await getUsdPerToken('ETH');
      expect(price).toBe(2500);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toContain('binance.com');
    });

    it('CoinGecko 네트워크 에러 시 Binance 폴백', async () => {
      // CoinGecko: 네트워크 에러
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      // Binance: 성공
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ price: '95000' }),
      );

      // BNB는 두 소스 모두 지원
      const price = await getUsdPerToken('BNB');
      expect(price).toBeGreaterThan(0);
    });

    it('CoinGecko 잘못된 JSON 응답 시 Binance 폴백', async () => {
      // CoinGecko: 응답은 ok지만 잘못된 구조
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ wrong_key: { usd: 9.0 } }),
      );
      // Binance: 성공
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ price: '9.5' }),
      );

      const price = await getUsdPerToken('APT');
      expect(price).toBe(9.5);
    });
  });

  // ── Both sources fail ──
  describe('두 소스 모두 실패', () => {
    it('CoinGecko + Binance 모두 실패 → 에러 throw', async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({}, false, 503));
      mockFetch.mockResolvedValueOnce(makeJsonResponse({}, false, 503));

      await expect(getUsdPerToken('ETH')).rejects.toThrow('ETH_PRICE_USD_NOT_AVAILABLE');
    });

    it('두 소스 모두 네트워크 에러 → 에러 throw', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      mockFetch.mockRejectedValueOnce(new Error('timeout'));

      await expect(getUsdPerToken('SOL')).rejects.toThrow('SOL_PRICE_USD_NOT_AVAILABLE');
    });
  });

  // ── Stale cache fallback ──
  describe('Stale 캐시 폴백 (10분 이내)', () => {
    it('두 소스 실패 시 stale 캐시(10분 이내)에서 반환', async () => {
      // 1. 캐시 채우기
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ ethereum: { usd: 3000 } }),
      );
      await getUsdPerToken('ETH');

      // 2. TTL 만료 시뮬레이션: Date.now를 조작하여 61초 후 상태
      const realNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(realNow() + 61_000);

      // 3. 두 소스 모두 실패
      mockFetch.mockResolvedValueOnce(makeJsonResponse({}, false, 500));
      mockFetch.mockResolvedValueOnce(makeJsonResponse({}, false, 500));

      // stale cache (within 10 minutes) should return 3000
      const price = await getUsdPerToken('ETH');
      expect(price).toBe(3000);

      vi.restoreAllMocks();
    });
  });

  // ── Edge: 0 or negative price from API ──
  describe('비정상 API 응답 처리', () => {
    it('usd: 0 응답 → null로 처리되어 Binance 폴백 시도', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ aptos: { usd: 0 } }), // 0은 유효하지 않음
      );
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ price: '8.5' }),
      );

      const price = await getUsdPerToken('APT');
      expect(price).toBe(8.5);
    });

    it('usd: -1 응답 → null로 처리되어 Binance 폴백', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ aptos: { usd: -1 } }),
      );
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ price: '8.0' }),
      );

      const price = await getUsdPerToken('APT');
      expect(price).toBe(8.0);
    });
  });
});
