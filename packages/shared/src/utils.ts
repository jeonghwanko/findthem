import type { SubjectType, CollectedInfo, Locale } from './types.js';
import { DEFAULT_LOCALE } from './types.js';
import { SUBJECT_TYPE_LABELS } from './constants.js';

/** SubjectType 라벨 반환 (다국어) */
export function getSubjectTypeLabel(type: SubjectType | string, locale: Locale = DEFAULT_LOCALE): string {
  const labels = SUBJECT_TYPE_LABELS[locale] ?? SUBJECT_TYPE_LABELS[DEFAULT_LOCALE];
  return labels[type as SubjectType] || type;
}

// ── parseSubjectType 다국어 키워드 ──

const SUBJECT_KEYWORDS: Record<Locale, { pattern: string[]; type: SubjectType }[]> = {
  ko: [
    { pattern: ['사람', '미아'], type: 'PERSON' },
    { pattern: ['강아지', '개'], type: 'DOG' },
    { pattern: ['고양이'], type: 'CAT' },
  ],
  en: [
    { pattern: ['person', 'human', 'people', 'child', 'kid'], type: 'PERSON' },
    { pattern: ['dog', 'puppy'], type: 'DOG' },
    { pattern: ['cat', 'kitten'], type: 'CAT' },
  ],
  ja: [
    { pattern: ['人', 'ひと', '子供', '子ども'], type: 'PERSON' },
    { pattern: ['犬', 'いぬ', 'わんちゃん'], type: 'DOG' },
    { pattern: ['猫', 'ねこ', 'にゃんこ'], type: 'CAT' },
  ],
  'zh-TW': [
    { pattern: ['人', '小孩', '兒童'], type: 'PERSON' },
    { pattern: ['狗', '犬', '小狗'], type: 'DOG' },
    { pattern: ['貓', '猫', '小貓'], type: 'CAT' },
  ],
};

/** 대상 유형 입력을 SubjectType으로 파싱 (다국어) */
export function parseSubjectType(msg: string, locale: Locale = DEFAULT_LOCALE): SubjectType | null {
  const lower = msg.toLowerCase();

  // 먼저 현재 locale로 시도
  const localeKeywords = SUBJECT_KEYWORDS[locale] ?? SUBJECT_KEYWORDS[DEFAULT_LOCALE];
  for (const { pattern, type } of localeKeywords) {
    if (pattern.some((kw) => lower.includes(kw))) return type;
  }

  // fallback: 모든 locale에서 시도
  for (const [loc, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    if (loc === locale) continue;
    for (const { pattern, type } of keywords) {
      if (pattern.some((kw) => lower.includes(kw))) return type;
    }
  }

  return null;
}

// ── parseTimeExpression 다국어 ──

function parseTimeExpressionKo(msg: string): string {
  const now = new Date();

  if (msg.includes('방금') || msg.includes('지금')) return now.toISOString();

  if (msg.includes('어제')) {
    now.setDate(now.getDate() - 1);
  } else if (msg.includes('그저께') || msg.includes('그제')) {
    now.setDate(now.getDate() - 2);
  }

  const isPM = msg.includes('오후') || msg.includes('저녁') || msg.includes('밤');
  const isAM = msg.includes('오전') || msg.includes('아침') || msg.includes('새벽');

  const hourMatch = msg.match(/(\d{1,2})\s*시/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    now.setHours(hour, 0, 0, 0);
  } else if (msg.includes('저녁') || msg.includes('밤')) {
    now.setHours(19, 0, 0, 0);
  } else if (msg.includes('아침') || msg.includes('새벽')) {
    now.setHours(7, 0, 0, 0);
  } else if (msg.includes('점심')) {
    now.setHours(12, 0, 0, 0);
  }

  const minMatch = msg.match(/(\d{1,2})\s*분/);
  if (minMatch) now.setMinutes(parseInt(minMatch[1]));

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

function parseTimeExpressionEn(msg: string): string {
  const now = new Date();
  const lower = msg.toLowerCase();

  if (lower.includes('just now') || lower.includes('right now')) return now.toISOString();

  if (lower.includes('yesterday')) {
    now.setDate(now.getDate() - 1);
  } else if (lower.includes('day before yesterday')) {
    now.setDate(now.getDate() - 2);
  }

  const isPM = lower.includes('pm') || lower.includes('evening') || lower.includes('night');
  const isAM = lower.includes('am') || lower.includes('morning');

  const hourMatch = lower.match(/(\d{1,2})\s*(?::|o'clock|pm|am)/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    now.setHours(hour, 0, 0, 0);
  } else if (lower.includes('evening') || lower.includes('night')) {
    now.setHours(19, 0, 0, 0);
  } else if (lower.includes('morning')) {
    now.setHours(7, 0, 0, 0);
  } else if (lower.includes('noon') || lower.includes('lunch')) {
    now.setHours(12, 0, 0, 0);
  }

  const agoHourMatch = lower.match(/(\d+)\s*hours?\s*ago/);
  if (agoHourMatch) {
    const result = new Date();
    result.setHours(result.getHours() - parseInt(agoHourMatch[1]));
    return result.toISOString();
  }
  const agoMinMatch = lower.match(/(\d+)\s*min(?:ute)?s?\s*ago/);
  if (agoMinMatch) {
    const result = new Date();
    result.setMinutes(result.getMinutes() - parseInt(agoMinMatch[1]));
    return result.toISOString();
  }

  return now.toISOString();
}

function parseTimeExpressionJa(msg: string): string {
  const now = new Date();

  if (msg.includes('さっき') || msg.includes('たった今') || msg.includes('今')) return now.toISOString();

  if (msg.includes('昨日') || msg.includes('きのう')) {
    now.setDate(now.getDate() - 1);
  } else if (msg.includes('一昨日') || msg.includes('おととい')) {
    now.setDate(now.getDate() - 2);
  }

  const isPM = msg.includes('午後') || msg.includes('夜') || msg.includes('夕方');
  const isAM = msg.includes('午前') || msg.includes('朝') || msg.includes('早朝');

  const hourMatch = msg.match(/(\d{1,2})\s*時/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    now.setHours(hour, 0, 0, 0);
  } else if (msg.includes('夜') || msg.includes('夕方')) {
    now.setHours(19, 0, 0, 0);
  } else if (msg.includes('朝') || msg.includes('早朝')) {
    now.setHours(7, 0, 0, 0);
  } else if (msg.includes('昼')) {
    now.setHours(12, 0, 0, 0);
  }

  const minMatch = msg.match(/(\d{1,2})\s*分/);
  if (minMatch && !msg.includes('分前')) now.setMinutes(parseInt(minMatch[1]));

  const agoHourMatch = msg.match(/(\d+)\s*時間前/);
  if (agoHourMatch) {
    const result = new Date();
    result.setHours(result.getHours() - parseInt(agoHourMatch[1]));
    return result.toISOString();
  }
  const agoMinMatch = msg.match(/(\d+)\s*分前/);
  if (agoMinMatch) {
    const result = new Date();
    result.setMinutes(result.getMinutes() - parseInt(agoMinMatch[1]));
    return result.toISOString();
  }

  return now.toISOString();
}

function parseTimeExpressionZhTW(msg: string): string {
  const now = new Date();

  if (msg.includes('剛才') || msg.includes('剛剛') || msg.includes('現在')) return now.toISOString();

  if (msg.includes('昨天')) {
    now.setDate(now.getDate() - 1);
  } else if (msg.includes('前天')) {
    now.setDate(now.getDate() - 2);
  }

  const isPM = msg.includes('下午') || msg.includes('晚上') || msg.includes('傍晚');
  const isAM = msg.includes('上午') || msg.includes('早上') || msg.includes('清晨');

  const hourMatch = msg.match(/(\d{1,2})\s*[點点]/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    now.setHours(hour, 0, 0, 0);
  } else if (msg.includes('晚上') || msg.includes('傍晚')) {
    now.setHours(19, 0, 0, 0);
  } else if (msg.includes('早上') || msg.includes('清晨')) {
    now.setHours(7, 0, 0, 0);
  } else if (msg.includes('中午')) {
    now.setHours(12, 0, 0, 0);
  }

  const minMatch = msg.match(/(\d{1,2})\s*分/);
  if (minMatch && !msg.includes('分鐘前')) now.setMinutes(parseInt(minMatch[1]));

  const agoHourMatch = msg.match(/(\d+)\s*(?:小時|個小時)前/);
  if (agoHourMatch) {
    const result = new Date();
    result.setHours(result.getHours() - parseInt(agoHourMatch[1]));
    return result.toISOString();
  }
  const agoMinMatch = msg.match(/(\d+)\s*分鐘前/);
  if (agoMinMatch) {
    const result = new Date();
    result.setMinutes(result.getMinutes() - parseInt(agoMinMatch[1]));
    return result.toISOString();
  }

  return now.toISOString();
}

/** 시간 표현을 ISO 문자열로 파싱 (다국어) */
export function parseTimeExpression(msg: string, locale: Locale = DEFAULT_LOCALE): string {
  switch (locale) {
    case 'ko': return parseTimeExpressionKo(msg);
    case 'en': return parseTimeExpressionEn(msg);
    case 'ja': return parseTimeExpressionJa(msg);
    case 'zh-TW': return parseTimeExpressionZhTW(msg);
    default: return parseTimeExpressionKo(msg);
  }
}

// ── buildSightingSummary 다국어 ──

const SUMMARY_LABELS: Record<Locale, {
  type: string; desc: string; place: string; time: string;
  photo: string; photos: string; reporter: string; contact: string; none: string;
}> = {
  ko: { type: '유형', desc: '설명', place: '장소', time: '시간', photo: '사진', photos: '장', reporter: '제보자', contact: '연락처', none: '(없음)' },
  en: { type: 'Type', desc: 'Description', place: 'Location', time: 'Time', photo: 'Photos', photos: '', reporter: 'Reporter', contact: 'Contact', none: '(none)' },
  ja: { type: '種類', desc: '説明', place: '場所', time: '時間', photo: '写真', photos: '枚', reporter: '通報者', contact: '連絡先', none: '（なし）' },
  'zh-TW': { type: '類型', desc: '描述', place: '地點', time: '時間', photo: '照片', photos: '張', reporter: '報告者', contact: '聯絡方式', none: '（無）' },
};

/** 제보 요약 텍스트 생성 (다국어) */
export function buildSightingSummary(context: CollectedInfo, locale: Locale = DEFAULT_LOCALE): string {
  const l = SUMMARY_LABELS[locale] ?? SUMMARY_LABELS[DEFAULT_LOCALE];
  const typeLabel = getSubjectTypeLabel(context.subjectType || 'DOG', locale);

  const localeTag = locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : locale === 'zh-TW' ? 'zh-TW' : 'en-US';
  const photoCount = context.photoUrls?.length;
  const photoText = photoCount
    ? (locale === 'en' ? `${photoCount}` : `${photoCount}${l.photos}`)
    : l.none;

  const lines = [
    `${l.type}: ${typeLabel}`,
    `${l.desc}: ${context.description || l.none}`,
    `${l.place}: ${context.address || l.none}`,
    `${l.time}: ${context.sightedAt ? new Date(context.sightedAt).toLocaleString(localeTag) : l.none}`,
    `${l.photo}: ${photoText}`,
  ];
  if (context.tipsterName) lines.push(`${l.reporter}: ${context.tipsterName}`);
  if (context.tipsterPhone) lines.push(`${l.contact}: ${context.tipsterPhone}`);
  return lines.join('\n');
}

// ── formatTimeAgo 다국어 ──

const TIME_AGO_LABELS: Record<Locale, {
  just: string; min: string; hour: string; day: string; month: string; year: string;
}> = {
  ko: { just: '방금 전', min: '분 전', hour: '시간 전', day: '일 전', month: '개월 전', year: '년 전' },
  en: { just: 'just now', min: 'min ago', hour: 'hr ago', day: 'd ago', month: 'mo ago', year: 'yr ago' },
  ja: { just: 'たった今', min: '分前', hour: '時間前', day: '日前', month: 'ヶ月前', year: '年前' },
  'zh-TW': { just: '剛才', min: '分鐘前', hour: '小時前', day: '天前', month: '個月前', year: '年前' },
};

/** 상대 시간 포맷 (다국어) */
export function formatTimeAgo(dateStr: string, locale: Locale = DEFAULT_LOCALE): string {
  const l = TIME_AGO_LABELS[locale] ?? TIME_AGO_LABELS[DEFAULT_LOCALE];
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return l.just;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${locale === 'en' ? ' ' : ''}${l.min}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${locale === 'en' ? ' ' : ''}${l.hour}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}${locale === 'en' ? ' ' : ''}${l.day}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}${locale === 'en' ? ' ' : ''}${l.month}`;
  return `${Math.floor(months / 12)}${locale === 'en' ? ' ' : ''}${l.year}`;
}
