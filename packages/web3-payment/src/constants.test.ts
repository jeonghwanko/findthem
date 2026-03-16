import { describe, it, expect } from 'vitest';
import {
  EVM_CHAIN_IDS,
  EVM_TOKENS,
  SOL_TOKENS,
  APT_DECIMALS,
  APT_NATIVE_COIN_TYPE,
  SUPPORTED_PAY_TOKENS,
  QUOTE_TTL_SECS,
  isSupportedChainId,
  toSupportedChainId,
  type SupportedChainId,
} from './constants.js';

// ────────────────────────────────────────────────────────────
// isSupportedChainId
// ────────────────────────────────────────────────────────────
describe('isSupportedChainId', () => {
  it('Ethereum mainnet(1) → true', () => {
    expect(isSupportedChainId(1)).toBe(true);
  });

  it('BSC(56) → true', () => {
    expect(isSupportedChainId(56)).toBe(true);
  });

  it('Base(8453) → true', () => {
    expect(isSupportedChainId(8453)).toBe(true);
  });

  it('Polygon(137) → false', () => {
    expect(isSupportedChainId(137)).toBe(false);
  });

  it('Arbitrum(42161) → false', () => {
    expect(isSupportedChainId(42161)).toBe(false);
  });

  it('0 → false', () => {
    expect(isSupportedChainId(0)).toBe(false);
  });

  it('-1 → false', () => {
    expect(isSupportedChainId(-1)).toBe(false);
  });

  it('반환값이 타입 가드 역할을 한다 — narrow된 변수에 SupportedChainId 대입 가능', () => {
    const id = 56 as number;
    if (isSupportedChainId(id)) {
      // TypeScript 타입 가드 동작 확인: 런타임에서 아래 대입이 문제없어야 한다
      const narrowed: SupportedChainId = id;
      expect(narrowed).toBe(56);
    } else {
      throw new Error('isSupportedChainId(56) should return true');
    }
  });
});

// ────────────────────────────────────────────────────────────
// toSupportedChainId
// ────────────────────────────────────────────────────────────
describe('toSupportedChainId', () => {
  it('56 → 56', () => {
    expect(toSupportedChainId(56)).toBe(56);
  });

  it('8453 → 8453', () => {
    expect(toSupportedChainId(8453)).toBe(8453);
  });

  it('1 → 1 (Ethereum mainnet 통과)', () => {
    expect(toSupportedChainId(1)).toBe(1);
  });

  it('지원하지 않는 체인(137) → 1(Ethereum fallback)', () => {
    expect(toSupportedChainId(137)).toBe(1);
  });

  it('undefined → 1(Ethereum fallback)', () => {
    expect(toSupportedChainId(undefined)).toBe(1);
  });

  it('0 → 1(Ethereum fallback)', () => {
    expect(toSupportedChainId(0)).toBe(1);
  });

  it('반환값은 항상 isSupportedChainId를 통과한다', () => {
    const inputs = [1, 56, 8453, 137, 42161, 0, undefined];
    for (const input of inputs) {
      const result = toSupportedChainId(input);
      expect(isSupportedChainId(result)).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────
// EVM_TOKENS structure
// ────────────────────────────────────────────────────────────
describe('EVM_TOKENS 구조', () => {
  it('세 체인(1, 56, 8453)에 대한 항목을 가진다', () => {
    expect(EVM_TOKENS[1]).toBeDefined();
    expect(EVM_TOKENS[56]).toBeDefined();
    expect(EVM_TOKENS[8453]).toBeDefined();
  });

  it('Ethereum(1) — USDC 소수점 6자리, 올바른 주소', () => {
    const usdc = EVM_TOKENS[1]['USDC'];
    expect(usdc).toBeDefined();
    expect(usdc!.decimals).toBe(6);
    expect(usdc!.address.toLowerCase()).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('Ethereum(1) — USDt 소수점 6자리', () => {
    const usdt = EVM_TOKENS[1]['USDt'];
    expect(usdt).toBeDefined();
    expect(usdt!.decimals).toBe(6);
  });

  it('Ethereum(1) — ETH native placeholder 주소, 소수점 18자리', () => {
    const eth = EVM_TOKENS[1]['ETH'];
    expect(eth).toBeDefined();
    expect(eth!.address).toBe('ETH');
    expect(eth!.decimals).toBe(18);
  });

  it('BSC(56) — USDC 소수점 18자리 (BSC는 18 decimals)', () => {
    const usdc = EVM_TOKENS[56]['USDC'];
    expect(usdc).toBeDefined();
    expect(usdc!.decimals).toBe(18);
  });

  it('BSC(56) — BNB native placeholder 주소', () => {
    const bnb = EVM_TOKENS[56]['BNB'];
    expect(bnb).toBeDefined();
    expect(bnb!.address).toBe('BNB');
    expect(bnb!.decimals).toBe(18);
  });

  it('Base(8453) — USDC 소수점 6자리', () => {
    const usdc = EVM_TOKENS[8453]['USDC'];
    expect(usdc).toBeDefined();
    expect(usdc!.decimals).toBe(6);
  });

  it('Base(8453) — USDt 항목 없음 (지원하지 않는 토큰)', () => {
    expect(EVM_TOKENS[8453]['USDt']).toBeUndefined();
  });

  it('모든 주소가 "ETH" | "BNB" 또는 0x로 시작하는 형식', () => {
    const nativePlaceholders = new Set(['ETH', 'BNB']);
    for (const [, tokens] of Object.entries(EVM_TOKENS)) {
      for (const [, info] of Object.entries(tokens)) {
        if (info) {
          expect(
            nativePlaceholders.has(info.address) || info.address.startsWith('0x'),
          ).toBe(true);
        }
      }
    }
  });
});

// ────────────────────────────────────────────────────────────
// SOL_TOKENS structure
// ────────────────────────────────────────────────────────────
describe('SOL_TOKENS 구조', () => {
  it('USDC, USDt, USDT, SOL 항목을 가진다', () => {
    expect(SOL_TOKENS['USDC']).toBeDefined();
    expect(SOL_TOKENS['USDt']).toBeDefined();
    expect(SOL_TOKENS['USDT']).toBeDefined();
    expect(SOL_TOKENS['SOL']).toBeDefined();
  });

  it('USDC 소수점 6자리', () => {
    expect(SOL_TOKENS['USDC'].decimals).toBe(6);
  });

  it('SOL 소수점 9자리', () => {
    expect(SOL_TOKENS['SOL'].decimals).toBe(9);
  });

  it('USDt와 USDT는 동일한 mint 주소를 가진다', () => {
    expect(SOL_TOKENS['USDt'].mint).toBe(SOL_TOKENS['USDT'].mint);
  });
});

// ────────────────────────────────────────────────────────────
// Aptos constants
// ────────────────────────────────────────────────────────────
describe('Aptos 상수', () => {
  it('APT_DECIMALS = 8', () => {
    expect(APT_DECIMALS).toBe(8);
  });

  it('APT_NATIVE_COIN_TYPE 올바른 형식', () => {
    expect(APT_NATIVE_COIN_TYPE).toBe('0x1::aptos_coin::AptosCoin');
  });
});

// ────────────────────────────────────────────────────────────
// SUPPORTED_PAY_TOKENS & QUOTE_TTL_SECS
// ────────────────────────────────────────────────────────────
describe('SUPPORTED_PAY_TOKENS', () => {
  it('APT를 포함한다', () => {
    expect(SUPPORTED_PAY_TOKENS).toContain('APT');
  });

  it('USDC, ETH, BNB, SOL, USDt를 포함한다', () => {
    expect(SUPPORTED_PAY_TOKENS).toContain('USDC');
    expect(SUPPORTED_PAY_TOKENS).toContain('ETH');
    expect(SUPPORTED_PAY_TOKENS).toContain('BNB');
    expect(SUPPORTED_PAY_TOKENS).toContain('SOL');
    expect(SUPPORTED_PAY_TOKENS).toContain('USDt');
  });
});

describe('QUOTE_TTL_SECS', () => {
  it('300초(5분)', () => {
    expect(QUOTE_TTL_SECS).toBe(300);
  });
});

// ────────────────────────────────────────────────────────────
// EVM_CHAIN_IDS
// ────────────────────────────────────────────────────────────
describe('EVM_CHAIN_IDS', () => {
  it('ETHEREUM = 1', () => {
    expect(EVM_CHAIN_IDS.ETHEREUM).toBe(1);
  });

  it('BSC = 56', () => {
    expect(EVM_CHAIN_IDS.BSC).toBe(56);
  });

  it('BASE = 8453', () => {
    expect(EVM_CHAIN_IDS.BASE).toBe(8453);
  });
});
