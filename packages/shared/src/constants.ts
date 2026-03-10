import type { SubjectType, ConversationStep } from './types.js';

// ── 대상 유형 라벨 ──

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  PERSON: '사람',
  DOG: '강아지',
  CAT: '고양이',
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

// ── 챗봇 단계별 메시지 ──

export const STEP_MESSAGES: Record<ConversationStep, string> = {
  GREETING:
    '안녕하세요! 실종자/반려동물 목격 제보 챗봇입니다. 🔍\n어떤 종류를 목격하셨나요?',
  SUBJECT_TYPE: '목격하신 대상을 선택해주세요.',
  PHOTO: '목격하신 사진이 있으면 보내주세요. 없으면 "없음"이라고 입력해주세요.',
  DESCRIPTION:
    '어떤 모습이었나요? 색상, 크기, 특징 등을 알려주세요.',
  LOCATION: '어디에서 목격하셨나요? (예: 서울시 강남구 역삼역 3번출구 앞)',
  TIME: '언제 목격하셨나요? (예: 오늘 오후 3시, 어제 저녁)',
  CONTACT:
    '연락처를 남겨주시면 매칭 시 알려드립니다. (선택사항, "건너뛰기" 가능)',
  CONFIRM: '',
  SUBMITTED:
    '제보가 접수되었습니다! AI가 실종 신고들과 비교 분석을 시작합니다. 감사합니다. 🙏',
};

export const STEP_QUICK_REPLIES: Partial<Record<ConversationStep, string[]>> = {
  GREETING: ['사람', '강아지', '고양이'],
  SUBJECT_TYPE: ['사람', '강아지', '고양이'],
  PHOTO: ['없음'],
  CONTACT: ['건너뛰기'],
};

// ── BullMQ 큐 이름 ──

export const QUEUE_NAMES = {
  IMAGE_PROCESSING: 'image-processing',
  PROMOTION: 'promotion',
  MATCHING: 'matching',
  NOTIFICATION: 'notification',
  CLEANUP: 'cleanup',
} as const;

// ── JWT ──

export const TOKEN_STORAGE_KEY = 'ft_token';
