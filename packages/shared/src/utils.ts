import type { SubjectType, CollectedInfo } from './types.js';
import { SUBJECT_TYPE_LABELS } from './constants.js';

/** SubjectType 라벨 반환 */
export function getSubjectTypeLabel(type: SubjectType | string): string {
  return SUBJECT_TYPE_LABELS[type as SubjectType] || type;
}

/** 한국어 대상 유형 입력을 SubjectType으로 파싱 */
export function parseSubjectType(msg: string): SubjectType | null {
  const lower = msg.toLowerCase();
  if (lower.includes('사람') || lower.includes('미아') || lower.includes('person')) return 'PERSON';
  if (lower.includes('강아지') || lower.includes('개') || lower.includes('dog')) return 'DOG';
  if (lower.includes('고양이') || lower.includes('cat')) return 'CAT';
  return null;
}

/** 한국어 시간 표현을 ISO 문자열로 파싱 */
export function parseTimeExpression(msg: string): string {
  const now = new Date();

  if (msg.includes('방금') || msg.includes('지금')) {
    return now.toISOString();
  }

  if (msg.includes('어제')) {
    now.setDate(now.getDate() - 1);
  } else if (msg.includes('그저께') || msg.includes('그제')) {
    now.setDate(now.getDate() - 2);
  }

  // 오전/오후 체크 (시간 파싱 전에 확인)
  const isPM = msg.includes('오후') || msg.includes('저녁') || msg.includes('밤');
  const isAM = msg.includes('오전') || msg.includes('아침') || msg.includes('새벽');

  // 시간 추출
  const hourMatch = msg.match(/(\d{1,2})\s*시/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    now.setHours(hour);
    now.setMinutes(0);
    now.setSeconds(0);
    now.setMilliseconds(0);
  } else if (msg.includes('저녁') || msg.includes('밤')) {
    now.setHours(19, 0, 0, 0);
  } else if (msg.includes('아침') || msg.includes('새벽')) {
    now.setHours(7, 0, 0, 0);
  } else if (msg.includes('점심')) {
    now.setHours(12, 0, 0, 0);
  }

  // 분 추출
  const minMatch = msg.match(/(\d{1,2})\s*분/);
  if (minMatch) {
    now.setMinutes(parseInt(minMatch[1]));
  }

  // "~전" 패턴 (e.g. "30분 전", "2시간 전")
  const agoHourMatch = msg.match(/(\d+)\s*시간\s*전/);
  if (agoHourMatch) {
    const result = new Date();
    result.setHours(result.getHours() - parseInt(agoHourMatch[1]));
    return result.toISOString();
  }
  const agoMinMatch = msg.match(/(\d+)\s*분\s*전/);
  if (agoMinMatch) {
    const result = new Date();
    result.setMinutes(result.getMinutes() - parseInt(agoMinMatch[1]));
    return result.toISOString();
  }

  return now.toISOString();
}

/** 제보 요약 텍스트 생성 */
export function buildSightingSummary(context: CollectedInfo): string {
  const typeLabel = getSubjectTypeLabel(context.subjectType || 'DOG');
  const lines = [
    `유형: ${typeLabel}`,
    `설명: ${context.description || '(없음)'}`,
    `장소: ${context.address || '(없음)'}`,
    `시간: ${context.sightedAt ? new Date(context.sightedAt).toLocaleString('ko-KR') : '(없음)'}`,
    `사진: ${context.photoUrls?.length ? `${context.photoUrls.length}장` : '없음'}`,
  ];
  if (context.tipsterName) lines.push(`제보자: ${context.tipsterName}`);
  if (context.tipsterPhone) lines.push(`연락처: ${context.tipsterPhone}`);
  return lines.join('\n');
}

/** 상대 시간 포맷 (예: "3분 전", "2시간 전") */
export function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return '방금 전';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}
