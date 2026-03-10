import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSubjectType,
  parseTimeExpression,
  getSubjectTypeLabel,
  buildSightingSummary,
  formatTimeAgo,
} from './utils.js';
import type { CollectedInfo } from './types.js';

// ── parseSubjectType ──
describe('parseSubjectType', () => {
  it('한국어 "사람" → PERSON', () => {
    expect(parseSubjectType('사람')).toBe('PERSON');
  });

  it('한국어 "미아" → PERSON', () => {
    expect(parseSubjectType('미아를 봤어요')).toBe('PERSON');
  });

  it('한국어 "강아지" → DOG', () => {
    expect(parseSubjectType('강아지')).toBe('DOG');
  });

  it('한국어 "개" → DOG', () => {
    expect(parseSubjectType('개를 발견했습니다')).toBe('DOG');
  });

  it('한국어 "고양이" → CAT', () => {
    expect(parseSubjectType('고양이')).toBe('CAT');
  });

  it('영어 "person" → PERSON', () => {
    expect(parseSubjectType('person')).toBe('PERSON');
  });

  it('영어 "dog" → DOG', () => {
    expect(parseSubjectType('Dog')).toBe('DOG');
  });

  it('영어 "cat" → CAT', () => {
    expect(parseSubjectType('Cat')).toBe('CAT');
  });

  it('매칭 안되는 입력 → null', () => {
    expect(parseSubjectType('안녕하세요')).toBeNull();
    expect(parseSubjectType('bird')).toBeNull();
    expect(parseSubjectType('')).toBeNull();
  });
});

// ── parseTimeExpression ──
describe('parseTimeExpression', () => {
  beforeEach(() => {
    // 고정 시간: 2025-01-20 15:30:00 KST
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T06:30:00.000Z')); // UTC
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('"방금" → 현재 시간', () => {
    const result = parseTimeExpression('방금');
    expect(new Date(result).getTime()).toBe(new Date('2025-01-20T06:30:00.000Z').getTime());
  });

  it('"지금" → 현재 시간', () => {
    const result = parseTimeExpression('지금');
    expect(new Date(result).getTime()).toBe(new Date('2025-01-20T06:30:00.000Z').getTime());
  });

  it('"어제 오후 3시" → 어제 15시', () => {
    const result = new Date(parseTimeExpression('어제 오후 3시'));
    expect(result.getDate()).toBe(19); // 어제
    expect(result.getHours()).toBe(15);
  });

  it('"그저께" → 2일 전', () => {
    const result = new Date(parseTimeExpression('그저께'));
    expect(result.getDate()).toBe(18); // 2일 전
  });

  it('"그제" → 2일 전', () => {
    const result = new Date(parseTimeExpression('그제'));
    expect(result.getDate()).toBe(18);
  });

  it('"오전 9시" → 9시', () => {
    const result = new Date(parseTimeExpression('오전 9시'));
    expect(result.getHours()).toBe(9);
  });

  it('"오전 12시" → 0시 (자정)', () => {
    const result = new Date(parseTimeExpression('오전 12시'));
    expect(result.getHours()).toBe(0);
  });

  it('"오후 2시 30분" → 14시 30분', () => {
    const result = new Date(parseTimeExpression('오후 2시 30분'));
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it('"아침" → 7시', () => {
    const result = new Date(parseTimeExpression('아침'));
    expect(result.getHours()).toBe(7);
  });

  it('"점심" → 12시', () => {
    const result = new Date(parseTimeExpression('점심'));
    expect(result.getHours()).toBe(12);
  });

  it('"저녁" → 19시', () => {
    const result = new Date(parseTimeExpression('저녁'));
    expect(result.getHours()).toBe(19);
  });

  it('"30분 전" → 현재 - 30분', () => {
    const result = new Date(parseTimeExpression('30분 전'));
    const expected = new Date('2025-01-20T06:00:00.000Z');
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('"2시간 전" → 현재 - 2시간', () => {
    const result = new Date(parseTimeExpression('2시간 전'));
    const expected = new Date('2025-01-20T04:30:00.000Z');
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('시간 정보 없는 문자열 → 현재 시간 기반', () => {
    const result = parseTimeExpression('모르겠어요');
    expect(result).toBeTruthy();
    expect(() => new Date(result)).not.toThrow();
  });
});

// ── getSubjectTypeLabel ──
describe('getSubjectTypeLabel', () => {
  it('PERSON → "사람"', () => {
    expect(getSubjectTypeLabel('PERSON')).toBe('사람');
  });

  it('DOG → "강아지"', () => {
    expect(getSubjectTypeLabel('DOG')).toBe('강아지');
  });

  it('CAT → "고양이"', () => {
    expect(getSubjectTypeLabel('CAT')).toBe('고양이');
  });

  it('미등록 키 → 입력값 그대로 반환', () => {
    expect(getSubjectTypeLabel('BIRD')).toBe('BIRD');
  });
});

// ── buildSightingSummary ──
describe('buildSightingSummary', () => {
  it('모든 필드 포함된 context', () => {
    const context: CollectedInfo = {
      subjectType: 'DOG',
      description: '갈색 푸들',
      address: '서울시 강남구',
      sightedAt: '2025-01-20T06:00:00.000Z',
      photoUrls: ['/photos/1.jpg', '/photos/2.jpg'],
      tipsterName: '홍길동',
      tipsterPhone: '01012345678',
    };

    const summary = buildSightingSummary(context);
    expect(summary).toContain('유형: 강아지');
    expect(summary).toContain('설명: 갈색 푸들');
    expect(summary).toContain('장소: 서울시 강남구');
    expect(summary).toContain('사진: 2장');
    expect(summary).toContain('제보자: 홍길동');
    expect(summary).toContain('연락처: 01012345678');
  });

  it('최소 필드만 있는 context', () => {
    const context: CollectedInfo = {};

    const summary = buildSightingSummary(context);
    expect(summary).toContain('유형: 강아지'); // default
    expect(summary).toContain('설명: (없음)');
    expect(summary).toContain('장소: (없음)');
    expect(summary).toContain('사진: 없음');
    expect(summary).not.toContain('제보자:');
    expect(summary).not.toContain('연락처:');
  });

  it('사진이 빈 배열인 경우', () => {
    const context: CollectedInfo = { photoUrls: [] };
    const summary = buildSightingSummary(context);
    expect(summary).toContain('사진: 없음');
  });
});

// ── formatTimeAgo ──
describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('30초 전 → "방금 전"', () => {
    expect(formatTimeAgo('2025-01-20T11:59:30.000Z')).toBe('방금 전');
  });

  it('5분 전 → "5분 전"', () => {
    expect(formatTimeAgo('2025-01-20T11:55:00.000Z')).toBe('5분 전');
  });

  it('3시간 전 → "3시간 전"', () => {
    expect(formatTimeAgo('2025-01-20T09:00:00.000Z')).toBe('3시간 전');
  });

  it('2일 전 → "2일 전"', () => {
    expect(formatTimeAgo('2025-01-18T12:00:00.000Z')).toBe('2일 전');
  });

  it('45일 전 → "1개월 전"', () => {
    expect(formatTimeAgo('2024-12-06T12:00:00.000Z')).toBe('1개월 전');
  });

  it('400일 전 → "1년 전"', () => {
    expect(formatTimeAgo('2023-12-17T12:00:00.000Z')).toBe('1년 전');
  });
});
