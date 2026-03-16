import { describe, it, expect } from 'vitest';
import { toAtomic, fromUsdToTokenAmount, isRecord, toStr, toBigIntOrZero } from './utils.js';

// ────────────────────────────────────────────────────────────
// toAtomic
// ────────────────────────────────────────────────────────────
describe('toAtomic', () => {
  // ── 일반 변환 ──
  it('1.5 USDC (decimals=6) → "1500000"', () => {
    expect(toAtomic(1.5, 6)).toBe('1500000');
  });

  it('1 USDC (decimals=6) → "1000000"', () => {
    expect(toAtomic(1, 6)).toBe('1000000');
  });

  it('0.000001 USDC (decimals=6) — 최소 단위 1 → "1"', () => {
    expect(toAtomic(0.000001, 6)).toBe('1');
  });

  it('1 ETH (decimals=18) → "1000000000000000000"', () => {
    expect(toAtomic(1, 18)).toBe('1000000000000000000');
  });

  it('0.5 ETH (decimals=18) → "500000000000000000"', () => {
    expect(toAtomic(0.5, 18)).toBe('500000000000000000');
  });

  it('1 APT (decimals=8) → "100000000"', () => {
    expect(toAtomic(1, 8)).toBe('100000000');
  });

  it('0.25 APT (decimals=8) → "25000000"', () => {
    expect(toAtomic(0.25, 8)).toBe('25000000');
  });

  // ── 엣지 케이스 ──
  it('0 → "0" (decimals=6)', () => {
    expect(toAtomic(0, 6)).toBe('0');
  });

  it('0 → "0" (decimals=18)', () => {
    expect(toAtomic(0, 18)).toBe('0');
  });

  it('소수점 없는 정수 — 100 (decimals=6) → "100000000"', () => {
    expect(toAtomic(100, 6)).toBe('100000000');
  });

  it('decimals=0 — 정수 패스스루', () => {
    expect(toAtomic(42, 0)).toBe('42');
  });

  it('반환값은 숫자 문자열이다 (0x 접두사 없음, 소수점 없음)', () => {
    const result = toAtomic(1.23456789, 8);
    expect(result).toMatch(/^\d+$/);
  });

  it('선행 0 제거 — 0.000001 (decimals=8) 소수점 부분만 남김', () => {
    // 0.000001 * 10^8 = 100 → "100"
    const result = toAtomic(0.000001, 8);
    expect(result).toBe('100');
    expect(result).not.toMatch(/^0\d/); // 선행 0 없음
  });

  it('큰 금액 — 1000000 USDC (decimals=6) → "1000000000000"', () => {
    expect(toAtomic(1000000, 6)).toBe('1000000000000');
  });

  // ── decimal precision ──
  it('결과를 BigInt로 변환할 수 있다', () => {
    const atomic = toAtomic(1.5, 6);
    expect(() => BigInt(atomic)).not.toThrow();
    expect(BigInt(atomic)).toBe(1500000n);
  });
});

// ────────────────────────────────────────────────────────────
// fromUsdToTokenAmount
// ────────────────────────────────────────────────────────────
describe('fromUsdToTokenAmount', () => {
  it('$10 at $2000/ETH → 0.005 ETH', () => {
    expect(fromUsdToTokenAmount(10, 2000)).toBeCloseTo(0.005, 10);
  });

  it('$1 at $1/token (stablecoin) → 1 token', () => {
    expect(fromUsdToTokenAmount(1, 1)).toBe(1);
  });

  it('$100 at $50/APT → 2 APT', () => {
    expect(fromUsdToTokenAmount(100, 50)).toBe(2);
  });

  it('$0 → 0 tokens (0 USD 금액)', () => {
    expect(fromUsdToTokenAmount(0, 2000)).toBe(0);
  });

  it('매우 큰 토큰 가격 ($100000/BTC) → 소수 결과', () => {
    const result = fromUsdToTokenAmount(10, 100000);
    expect(result).toBeCloseTo(0.0001, 8);
  });

  it('매우 작은 가격 ($0.001/token) → 큰 토큰 수량', () => {
    expect(fromUsdToTokenAmount(1, 0.001)).toBeCloseTo(1000, 5);
  });

  it('toAtomic와 연계 — $5 at $2500/ETH → 원자 단위 계산', () => {
    const tokenAmount = fromUsdToTokenAmount(5, 2500); // 0.002
    const atomic = toAtomic(tokenAmount, 18);
    expect(BigInt(atomic)).toBe(2000000000000000n);
  });
});

// ────────────────────────────────────────────────────────────
// isRecord
// ────────────────────────────────────────────────────────────
describe('isRecord', () => {
  it('일반 객체 → true', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('빈 객체 → true', () => {
    expect(isRecord({})).toBe(true);
  });

  it('null → false', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('배열 → false', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('문자열 → false', () => {
    expect(isRecord('hello')).toBe(false);
  });

  it('숫자 → false', () => {
    expect(isRecord(42)).toBe(false);
  });

  it('undefined → false', () => {
    expect(isRecord(undefined)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// toStr
// ────────────────────────────────────────────────────────────
describe('toStr', () => {
  it('문자열 → 그대로 반환', () => {
    expect(toStr('hello')).toBe('hello');
  });

  it('숫자 → 문자열 변환', () => {
    expect(toStr(42)).toBe('42');
  });

  it('bigint → 문자열 변환', () => {
    expect(toStr(1000000000000000000n)).toBe('1000000000000000000');
  });

  it('null → 빈 문자열', () => {
    expect(toStr(null)).toBe('');
  });

  it('undefined → 빈 문자열', () => {
    expect(toStr(undefined)).toBe('');
  });

  it('객체 → 빈 문자열', () => {
    expect(toStr({ a: 1 })).toBe('');
  });
});

// ────────────────────────────────────────────────────────────
// toBigIntOrZero
// ────────────────────────────────────────────────────────────
describe('toBigIntOrZero', () => {
  it('bigint → 그대로 반환', () => {
    expect(toBigIntOrZero(1500000n)).toBe(1500000n);
  });

  it('정수 number → bigint 변환', () => {
    expect(toBigIntOrZero(42)).toBe(42n);
  });

  it('소수 number → 소수 부분 버림(trunc)', () => {
    expect(toBigIntOrZero(1.9)).toBe(1n);
    expect(toBigIntOrZero(2.1)).toBe(2n);
  });

  it('숫자 문자열 → bigint 변환', () => {
    expect(toBigIntOrZero('1000000')).toBe(1000000n);
  });

  it('Infinity → 0n', () => {
    expect(toBigIntOrZero(Infinity)).toBe(0n);
  });

  it('NaN → 0n', () => {
    expect(toBigIntOrZero(NaN)).toBe(0n);
  });

  it('null → 0n', () => {
    expect(toBigIntOrZero(null)).toBe(0n);
  });

  it('undefined → 0n', () => {
    expect(toBigIntOrZero(undefined)).toBe(0n);
  });

  it('파싱 불가 문자열 → 0n', () => {
    expect(toBigIntOrZero('abc')).toBe(0n);
  });

  it('빈 문자열 → 0n', () => {
    expect(toBigIntOrZero('')).toBe(0n);
  });

  it('toAtomic 결과를 toBigIntOrZero에 넣으면 올바른 bigint 반환', () => {
    const atomic = toAtomic(1.5, 6); // "1500000"
    expect(toBigIntOrZero(atomic)).toBe(1500000n);
  });
});
