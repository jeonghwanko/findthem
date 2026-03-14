import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCurrentTime } from './getCurrentTime.js';

describe('getCurrentTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('iso, formatted 필드를 포함한 객체를 반환한다', () => {
    const result = getCurrentTime();

    expect(result).toHaveProperty('iso');
    expect(result).toHaveProperty('formatted');
  });

  it('iso는 유효한 ISO 8601 문자열이다', () => {
    const result = getCurrentTime();

    expect(() => new Date(result.iso)).not.toThrow();
    expect(new Date(result.iso).toISOString()).toBe(result.iso);
  });

  it('formatted는 한국어 날짜 형식(년/월/일/시/분)이다', () => {
    const result = getCurrentTime();

    expect(result.formatted).toMatch(/\d{4}년 \d{2}월 \d{2}일 \d{2}시 \d{2}분/);
  });

  it('고정 시각에서 formatted가 KST(UTC+9) 기준으로 변환된다', () => {
    // UTC 2025-01-15 06:00:00 → KST 2025-01-15 15:00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T06:00:00.000Z'));

    const result = getCurrentTime();

    expect(result.formatted).toBe('2025년 01월 15일 15시 00분');
  });

  it('UTC 자정 직전은 KST 당일 오전 9시로 변환된다', () => {
    // UTC 2025-06-10 00:00:00 → KST 2025-06-10 09:00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-10T00:00:00.000Z'));

    const result = getCurrentTime();

    expect(result.formatted).toBe('2025년 06월 10일 09시 00분');
  });

  it('iso와 formatted가 동일한 시각을 나타낸다', () => {
    vi.useFakeTimers();
    const fixedTime = new Date('2025-03-14T12:00:00.000Z');
    vi.setSystemTime(fixedTime);

    const result = getCurrentTime();

    expect(result.iso).toBe(fixedTime.toISOString());
    // KST = UTC+9 → 12:00 UTC = 21:00 KST
    expect(result.formatted).toBe('2025년 03월 14일 21시 00분');
  });
});
