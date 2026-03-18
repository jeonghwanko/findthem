import type { SubjectType, ConversationStep, Locale } from './types.js';

// ── 대상 유형 라벨 (다국어) ──

export const SUBJECT_TYPE_LABELS: Record<Locale, Record<SubjectType, string>> = {
  ko: { PERSON: '사람', DOG: '강아지', CAT: '고양이' },
  en: { PERSON: 'Person', DOG: 'Dog', CAT: 'Cat' },
  ja: { PERSON: '人', DOG: '犬', CAT: '猫' },
  'zh-TW': { PERSON: '人', DOG: '狗', CAT: '貓' },
};

// ── 매칭 임계값 ──

export const MATCH_THRESHOLD = 0.6;
export const NOTIFY_THRESHOLD = 0.8;
export const MAX_CANDIDATES = 20;
export const MATCH_RADIUS_KM = 50;

// ── 페이지네이션 ──

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// ── 파일 업로드 ──

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_REPORT_PHOTOS = 5;
export const MAX_ADDITIONAL_PHOTOS = 3;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ── 챗봇 단계별 메시지 (다국어) ──

export const STEP_MESSAGES: Record<Locale, Record<ConversationStep, string>> = {
  ko: {
    GREETING:
      '안녕하세요! 실종자/반려동물 목격 제보 챗봇입니다. 🔍\n어떤 종류를 목격하셨나요?',
    SUBJECT_TYPE: '목격하신 대상을 선택해주세요.',
    PHOTO: '목격하신 사진이 있으면 보내주세요. 없으면 "없음"이라고 입력해주세요.',
    DESCRIPTION: '어떤 모습이었나요? 색상, 크기, 특징 등을 알려주세요.',
    LOCATION: '어디에서 목격하셨나요? (예: 서울시 강남구 역삼역 3번출구 앞)',
    TIME: '언제 목격하셨나요? (예: 오늘 오후 3시, 어제 저녁)',
    CONTACT: '연락처를 남겨주시면 매칭 시 알려드립니다. (선택사항, "건너뛰기" 가능)',
    CONFIRM: '',
    SUBMITTED: '제보가 접수되었습니다! AI가 실종 신고들과 비교 분석을 시작합니다. 감사합니다. 🙏',
  },
  en: {
    GREETING:
      'Hello! This is the missing person/pet sighting report chatbot. 🔍\nWhat type did you see?',
    SUBJECT_TYPE: 'Please select the type of subject you saw.',
    PHOTO: 'If you have a photo, please send it. Otherwise, type "none".',
    DESCRIPTION: 'What did they look like? Please describe color, size, features, etc.',
    LOCATION: 'Where did you see them? (e.g., 123 Main St, near the park)',
    TIME: 'When did you see them? (e.g., today at 3pm, yesterday evening)',
    CONTACT: 'Leave your contact info to be notified of matches. (Optional, type "skip")',
    CONFIRM: '',
    SUBMITTED: 'Your report has been submitted! AI will start comparing with missing reports. Thank you. 🙏',
  },
  ja: {
    GREETING:
      'こんにちは！行方不明者・ペットの目撃情報チャットボットです。🔍\nどの種類を目撃しましたか？',
    SUBJECT_TYPE: '目撃した対象を選択してください。',
    PHOTO: '目撃した写真があれば送ってください。なければ「なし」と入力してください。',
    DESCRIPTION: 'どのような姿でしたか？色、大きさ、特徴などを教えてください。',
    LOCATION: 'どこで目撃しましたか？（例：東京都渋谷区渋谷駅前）',
    TIME: 'いつ目撃しましたか？（例：今日の午後3時、昨日の夜）',
    CONTACT: '連絡先を残していただければ、マッチング時にお知らせします。（任意、「スキップ」可）',
    CONFIRM: '',
    SUBMITTED: '情報が受理されました！AIが行方不明届と比較分析を開始します。ありがとうございます。🙏',
  },
  'zh-TW': {
    GREETING:
      '您好！這是失蹤人口/寵物目擊報告聊天機器人。🔍\n您目擊了什麼類型？',
    SUBJECT_TYPE: '請選擇您目擊的對象類型。',
    PHOTO: '如果您有照片，請傳送。沒有的話請輸入「沒有」。',
    DESCRIPTION: '他們看起來是什麼樣子？請描述顏色、大小、特徵等。',
    LOCATION: '您在哪裡目擊的？（例：台北市信義區101大樓附近）',
    TIME: '您什麼時候目擊的？（例：今天下午3點、昨天晚上）',
    CONTACT: '留下聯絡方式，配對時會通知您。（選填，可輸入「跳過」）',
    CONFIRM: '',
    SUBMITTED: '您的報告已提交！AI 將開始與失蹤報告進行比對分析。謝謝您。🙏',
  },
};

export const STEP_QUICK_REPLIES: Record<Locale, Partial<Record<ConversationStep, string[]>>> = {
  ko: {
    GREETING: ['사람', '강아지', '고양이'],
    SUBJECT_TYPE: ['사람', '강아지', '고양이'],
    PHOTO: ['없음'],
    CONTACT: ['건너뛰기'],
  },
  en: {
    GREETING: ['Person', 'Dog', 'Cat'],
    SUBJECT_TYPE: ['Person', 'Dog', 'Cat'],
    PHOTO: ['None'],
    CONTACT: ['Skip'],
  },
  ja: {
    GREETING: ['人', '犬', '猫'],
    SUBJECT_TYPE: ['人', '犬', '猫'],
    PHOTO: ['なし'],
    CONTACT: ['スキップ'],
  },
  'zh-TW': {
    GREETING: ['人', '狗', '貓'],
    SUBJECT_TYPE: ['人', '狗', '貓'],
    PHOTO: ['沒有'],
    CONTACT: ['跳過'],
  },
};

// ── 에러 코드 ──

export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_BLOCKED: 'USER_BLOCKED',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  REPORT_OWNER_ONLY: 'REPORT_OWNER_ONLY',
  REPORT_STATUS_INVALID: 'REPORT_STATUS_INVALID',
  PHOTO_REQUIRED: 'PHOTO_REQUIRED',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_OWNER_ONLY: 'MATCH_OWNER_ONLY',
  SIGHTING_REPORT_NOT_FOUND: 'SIGHTING_REPORT_NOT_FOUND',
  IMAGE_ONLY: 'IMAGE_ONLY',
  PHOTO_ATTACH_REQUIRED: 'PHOTO_ATTACH_REQUIRED',
  SERVER_ERROR: 'SERVER_ERROR',
  INVALID_JOB_DATA: 'INVALID_JOB_DATA',
  INVALID_QUEUE_NAME: 'INVALID_QUEUE_NAME',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  SESSION_OVERFLOW: 'SESSION_OVERFLOW',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_OWNER_ONLY: 'SESSION_OWNER_ONLY',
  PLATFORM_NOT_SUPPORTED: 'PLATFORM_NOT_SUPPORTED',
  REPORT_PHOTO_LIMIT: 'REPORT_PHOTO_LIMIT',
  REPORT_EDIT_FORBIDDEN: 'REPORT_EDIT_FORBIDDEN',
  REPORT_DELETE_FORBIDDEN: 'REPORT_DELETE_FORBIDDEN',
  EXTERNAL_REPORT_IMMUTABLE: 'EXTERNAL_REPORT_IMMUTABLE',
  REPORT_NOT_ACTIVE: 'REPORT_NOT_ACTIVE',
  REPORT_STATUS_CONFLICT: 'REPORT_STATUS_CONFLICT',
  TWITTER_POST_FAILED: 'TWITTER_POST_FAILED',
  OUTREACH_NOT_FOUND: 'OUTREACH_NOT_FOUND',
  OUTREACH_ALREADY_PROCESSED: 'OUTREACH_ALREADY_PROCESSED',
  DEVLOG_CONTEXT_REQUIRED: 'DEVLOG_CONTEXT_REQUIRED',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  QUOTE_NOT_FOUND: 'QUOTE_NOT_FOUND',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  OAUTH_FAILED: 'OAUTH_FAILED',
  OAUTH_INVALID_STATE: 'OAUTH_INVALID_STATE',
  OAUTH_TELEGRAM_INVALID: 'OAUTH_TELEGRAM_INVALID',
  AGENT_AUTH_REQUIRED: 'AGENT_AUTH_REQUIRED',
  AGENT_INVALID_ID: 'AGENT_INVALID_ID',
  COMMUNITY_POST_NOT_FOUND: 'COMMUNITY_POST_NOT_FOUND',
  COMMUNITY_POST_OWNER_ONLY: 'COMMUNITY_POST_OWNER_ONLY',
  COMMUNITY_COMMENT_NOT_FOUND: 'COMMUNITY_COMMENT_NOT_FOUND',
  COMMUNITY_COMMENT_OWNER_ONLY: 'COMMUNITY_COMMENT_OWNER_ONLY',
  NO_FIELDS_TO_UPDATE: 'NO_FIELDS_TO_UPDATE',
  EXTERNAL_AGENT_NOT_FOUND: 'EXTERNAL_AGENT_NOT_FOUND',
  EXTERNAL_AGENT_AUTH_REQUIRED: 'EXTERNAL_AGENT_AUTH_REQUIRED',
  EXTERNAL_AGENT_INACTIVE: 'EXTERNAL_AGENT_INACTIVE',
  BOOST_LIMIT_REACHED: 'BOOST_LIMIT_REACHED',
  GAME_PLAY_LIMIT_REACHED: 'GAME_PLAY_LIMIT_REACHED',
  INVALID_GAME_CHARACTER: 'INVALID_GAME_CHARACTER',
  AD_REWARD_COOLDOWN: 'AD_REWARD_COOLDOWN',
} as const;

// ── BullMQ 큐 이름 ──

export const QUEUE_NAMES = {
  IMAGE_PROCESSING: 'image-processing',
  PROMOTION: 'promotion',
  MATCHING: 'matching',
  NOTIFICATION: 'notification',
  CLEANUP: 'cleanup',
  PROMOTION_MONITOR: 'promotion-monitor',
  PROMOTION_REPOST: 'promotion-repost',
  CRAWL_SCHEDULER: 'crawl-scheduler',
  CRAWL: 'crawl',
  CRAWL_AGENT: 'crawl-agent',
  OUTREACH: 'outreach',
} as const;

// ── 아웃리치 ──

export const OUTREACH_EMAIL_DAILY_LIMIT = 20;
export const OUTREACH_COMMENT_DAILY_LIMIT = 10;

// ── 수집 에이전트 ──

export const CRAWL_AGENT_MAX_ROUNDS = 20;

// ── JWT ──

export const TOKEN_STORAGE_KEY = 'ft_token';
export const ADMIN_KEY_STORAGE_KEY = 'ft_admin_key';

// ── 에이전트 공통 ──

export const AGENT_MAX_TOOL_ROUNDS = 5;
export const AGENT_MAX_HISTORY_MESSAGES = 40;

// ── 홍보 에이전트 ──

export const REPOST_INTERVAL_HIGH = 24;
export const REPOST_INTERVAL_MEDIUM = 72;
export const REPOST_INTERVAL_LOW = 168;
export const REPOST_MAX_DEFAULT = 3;
export const METRICS_COLLECT_INTERVAL_H = 6;
export const MIN_VIEWS_FOR_GOOD_PERFORMANCE = 100;

// ── 광고 부스트 ──

export const MAX_BOOSTS_PER_DAY = 3;

// ── 크롤/에이전트 ──

/** 네이버 검색 API 1회 요청 당 반환 결과 수 */
export const NAVER_SEARCH_DISPLAY_SIZE = 20;
/** AI 소셜 파싱 동시 처리 제한 */
export const AI_PARSING_CONCURRENCY = 3;
/** 관리자 에이전트 도구의 기본 검색 결과 수 */
export const AGENT_SEARCH_LIMIT = 5;
/** 공공 API 기본 페이지 행 수 */
export const PUBLIC_API_DEFAULT_ROWS = 50;

// ── 후원 XP & 레벨 ──

export const XP_PER_AD = 50;
export const AD_REWARD_COOLDOWN_SECS = 60;

/** pryzm 동일 공식: base 1000 XP, +15%/레벨, 50단위 반올림 */
export function requirementForSponsorLevel(level: number): number {
  if (level <= 1) return 1000;
  const base = 1000 * Math.pow(1.15, level - 1);
  return Math.round(base / 50) * 50;
}

export const LEVEL_REWARDS: Record<number, { type: string; value: string; label: string }> = {
  2:  { type: 'BADGE', value: 'supporter', label: '서포터 배지' },
  3:  { type: 'BADGE', value: 'helper',    label: '도우미 배지' },
  5:  { type: 'TITLE', value: 'champion',  label: '챔피언 칭호' },
  7:  { type: 'BADGE', value: 'hero',      label: '영웅 배지' },
  10: { type: 'TITLE', value: 'legend',    label: '전설 칭호' },
};

// ── 게임 ──

/** 일일 무료 플레이 횟수 */
export const MAX_FREE_PLAYS_PER_DAY = 3;

/** 광고 시청으로 추가 가능한 최대 플레이 횟수/일 */
export const MAX_AD_PLAYS_PER_DAY = 5;

/** 점수 1점당 적립 XP (나중에 XP 지급 시 사용) */
export const XP_PER_GAME_SCORE = 1;

// ── 운영 에이전트 ──

export const ADMIN_AGENT_MAX_TURNS = 10;
export const ADMIN_AGENT_MAX_TOKENS = 4096;
export const ADMIN_STATS_CACHE_TTL = 60;
export const ADMIN_API_KEY_HEADER = 'x-api-key';
export const AGENT_API_KEY_HEADER = 'x-agent-key';
export const AGENT_ID_HEADER = 'x-agent-id';
export const VALID_AGENT_IDS = ['image-matching', 'promotion', 'chatbot-alert'] as const;

// ── YouTube ──

export const YT_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
