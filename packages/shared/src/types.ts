// ── 다국어 (i18n) ──

export type Locale = 'ko' | 'ja' | 'zh-TW' | 'en';
export const SUPPORTED_LOCALES: Locale[] = ['ko', 'ja', 'zh-TW', 'en'];
export const DEFAULT_LOCALE: Locale = 'ko';

// ── 엔티티 공통 타입 (Prisma enum과 1:1 매핑) ──

export type SubjectType = 'PERSON' | 'DOG' | 'CAT';
export type ReportStatus = 'ACTIVE' | 'FOUND' | 'EXPIRED' | 'SUSPENDED';
export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN';
export type SightingSource = 'WEB' | 'KAKAO_CHATBOT' | 'ADMIN';
export type SightingStatus = 'PENDING' | 'ANALYZED' | 'CONFIRMED' | 'REJECTED';
export type MatchStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'NOTIFIED';
export type PromoPlatform = 'KAKAO_CHANNEL' | 'TWITTER' | 'INSTAGRAM';
export type PromoStatus = 'PENDING' | 'POSTED' | 'FAILED' | 'DELETED';
export type ChatPlatform = 'WEB' | 'KAKAO';
export type ChatStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
export type AuthProvider = 'LOCAL' | 'KAKAO' | 'NAVER' | 'TELEGRAM' | 'APPLE';
export type InquiryCategory = 'PAYMENT' | 'REPORT' | 'GENERAL' | 'PARTNERSHIP';
export type InquiryStatus = 'OPEN' | 'REPLIED' | 'CLOSED';

// ── API 응답 타입 ──

export interface UserPublic {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  profileImage?: string | null;
  provider?: AuthProvider;
  createdAt?: string;
  referralCode?: string | null;
}

export interface ReportPhoto {
  id: string;
  photoUrl: string;
  thumbnailUrl?: string | null;
  isPrimary: boolean;
}

export interface ReportSummary {
  id: string;
  subjectType: SubjectType;
  status: ReportStatus;
  name: string;
  species?: string | null;
  features: string;
  lastSeenAt: string;
  lastSeenAddress: string;
  lastSeenLat?: number | null;
  lastSeenLng?: number | null;
  contactPhone: string;
  contactName: string;
  reward?: string | null;
  photos: ReportPhoto[];
  createdAt: string;
  _count?: { sightings: number; matches: number };
}

export interface ReportDetail extends ReportSummary {
  gender?: Gender | null;
  age?: string | null;
  weight?: string | null;
  height?: string | null;
  color?: string | null;
  clothingDesc?: string | null;
  aiDescription?: string | null;
  user?: { id: string; name: string };
}

export interface SightingPhoto {
  id: string;
  photoUrl: string;
  thumbnailUrl?: string | null;
}

export interface Sighting {
  id: string;
  reportId?: string | null;
  description: string;
  sightedAt: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  photos: SightingPhoto[];
  createdAt: string;
}

export interface Match {
  id: string;
  reportId: string;
  sightingId: string;
  confidence: number;
  aiReasoning: string;
  status: MatchStatus;
  sighting: Sighting;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ReportListResponse extends PaginatedResponse<ReportSummary> {
  /** @deprecated reports 대신 items 사용 */
  reports: ReportSummary[];
}

export interface SightingListResponse {
  sightings: Sighting[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AuthResponse {
  user: UserPublic;
  token: string;
}

// ── 챗봇 타입 ──

export type ConversationStep =
  | 'GREETING'
  | 'SUBJECT_TYPE'
  | 'PHOTO'
  | 'DESCRIPTION'
  | 'LOCATION'
  | 'TIME'
  | 'CONTACT'
  | 'CONFIRM'
  | 'SUBMITTED';

export interface ConversationState {
  currentStep: ConversationStep;
}

export interface CollectedInfo {
  subjectType?: SubjectType;
  photoUrls?: string[];
  description?: string;
  address?: string;
  sightedAt?: string;
  tipsterName?: string;
  tipsterPhone?: string;
  reportId?: string;
}

export interface BotResponse {
  text: string;
  quickReplies?: string[];
  completed?: boolean;
}

// ── Job 타입 ──

export interface ImageJobData {
  type: 'report' | 'sighting';
  reportId?: string;
  sightingId?: string;
}

export interface PromotionJobData {
  reportId: string;
  isRepost?: boolean;
  version?: number;
  platforms?: PromoPlatform[];
  regenerateContent?: boolean;
  reason?: 'scheduled' | 'low_performance' | 'manual';
}

export interface MatchingJobData {
  type: 'sighting' | 'report';
  sightingId?: string;
  reportId?: string;
}

export interface CleanupJobData {
  reportId: string;
}

export interface NotificationJobData {
  matchId: string;
  reportId: string;
}

// ── AI 에이전트 타입 ──

export interface PlatformPromoTexts {
  kakao: string;
  twitter: string;
  instagram: string;
  general: string;
}

export interface MatchResult {
  confidence: number;
  reasoning: string;
  matchingFeatures: string[];
  differingFeatures: string[];
}

export interface PlatformPostResult {
  postId: string | null;
  postUrl: string | null;
}

export interface PlatformAdapter {
  readonly name: string;
  post(text: string, imagePaths: string[]): Promise<PlatformPostResult>;
  deletePost(postId: string): Promise<void>;
  getMetrics?(postId: string): Promise<PromotionMetrics | null>;
}

// ── 홍보 에이전트 타입 ──

export type PromoUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PromotionMetrics {
  views: number;
  likes: number;
  retweets: number;
  shares: number;
  replies: number;
}

export interface PromotionMonitorJobData {
  reportId: string;
  promotionId: string;
  platform: PromoPlatform;
  postId: string;
  /** Collection round: 0=1h, 1=24h, 2=72h */
  round?: number;
}

export interface PromotionRepostJobData {
  reportId?: string;
  reason: 'scheduled' | 'low_performance' | 'manual';
  platforms?: PromoPlatform[];
  regenerateContent?: boolean;
}

export interface CrawlDispatchJobData {
  // 특정 소스만 실행 (없으면 전체)
  sources?: string[];
}

export interface CrawlSourceJobData {
  source: string;
}

export interface CrawlAgentJobData {
  triggeredBy?: 'scheduler' | 'manual';
  sources?: string[];
}

export interface OutreachJobData {
  type: 'discover-contacts' | 'send-outreach';
  reportId?: string;
  outreachRequestId?: string;
}

export interface QaCrawlJobData {
  /** 특정 소스만 크롤 (없으면 전체) */
  sources?: string[];
  triggeredBy?: 'scheduler' | 'manual';
}

/** Q&A 크롤러가 반환하는 외부 질문 데이터 */
export interface ExternalQuestion {
  externalId: string;
  title: string;
  content: string;
  sourceUrl: string;
  sourceName: string;
  authorName?: string;
  tags?: string[];
  postedAt: Date;
}

// ── 정보 수집 에이전트 타입 ──

export type EngineVersion = 'v1' | 'v2';

export interface AgentToolCall {
  name: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AgentResponse {
  text: string;
  completed: boolean;
  toolsUsed: string[];
  photoAnalysis?: {
    description: string;
    features: string[];
    subjectType?: SubjectType;
  };
  similarReports?: {
    id: string;
    name: string;
    features: string;
    photoUrl?: string;
    similarity: string;
  }[];
  sightingId?: string;
}

// ── 운영 에이전트 타입 ──

export type AdminActionSource = 'DASHBOARD' | 'AGENT' | 'API';

export interface QueueStatusSummary {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface AdminOverviewStats {
  reports: {
    total: number;
    active: number;
    found: number;
    suspended: number;
    todayNew: number;
    weekNew: number;
  };
  sightings: {
    total: number;
    todayNew: number;
    weekNew: number;
    bySource: Record<SightingSource, number>;
  };
  matches: {
    total: number;
    confirmed: number;
    pending: number;
    avgConfidence: number;
    highConfidenceCount: number;
  };
  users: {
    total: number;
    todayNew: number;
    blocked: number;
  };
  queues: QueueStatusSummary[];
}

export interface TimelineDataPoint {
  date: string;
  count: number;
}

export interface AdminAgentChatRequest {
  sessionId?: string;
  message: string;
}

export interface AdminAgentToolResult {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface AdminAgentChatResponse {
  sessionId: string;
  reply: string;
  toolResults?: AdminAgentToolResult[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: unknown;
  source: AdminActionSource;
  agentSessionId?: string | null;
  createdAt: string;
}

// ── Community ──

export interface CommunityPostSummary {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  viewCount: number;
  userId: string | null;
  agentId: string | null;
  user: { id: string; name: string } | null;
  _count: { comments: number };
  createdAt: string;
  externalAgent?: ExternalAgentPublic | null;
}

export interface CommunityPostDetail extends CommunityPostSummary {
  comments: CommunityCommentPublic[];
}

export interface CommunityCommentPublic {
  id: string;
  postId: string;
  userId: string | null;
  agentId: string | null;
  content: string;
  user: { id: string; name: string } | null;
  createdAt: string;
}

// ── External Agent ──

export interface ExternalAgentPublic {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

export interface ExternalAgentAdmin extends ExternalAgentPublic {
  isActive: boolean;
  webhookUrl: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

// ── 후원 XP ──

export interface SponsorXpStats {
  sponsorXp: number;
  userLevel: number;
  currentXP: number;         // 현재 레벨 내 XP
  xpToNextLevel: number;     // 다음 레벨까지 필요 XP (0 = 최고 레벨)
  xpRequiredForLevel: number; // 현재 레벨 총 XP 요구량
}

export interface AdRewardResult {
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  xpGained: number;
  reward?: { type: string; value: string; label: string };
}

// ── Sponsor ──
export type AgentId = 'image-matching' | 'promotion' | 'chatbot-alert';

export interface SponsorPublic {
  id: string;
  agentId: AgentId;
  amount: number;
  currency: string;
  displayName: string | null;
  message: string | null;
  createdAt: string;
}

import type { SupportedPayToken } from './constants.js';
export type { SupportedPayToken };

export interface CryptoQuoteResult {
  quoteId: string;
  merchantWallet: string;
  amountAtomic: string;
  tokenSymbol: SupportedPayToken;
  chainId: number | null;
  tokenContract: string | null;
  quoteExpiresAt: string;
}

// ── Agent Character System ────────────────────────────────────────────────────

/** 성격을 의사결정 벡터로 정의 (0~1 범위) */
export interface AgentPersonality {
  sociability: number;    // 먼저 말 걸 확률
  caution: number;        // 확정 전 신중함
  optimism: number;       // 희망적 해석 성향
  urgency: number;        // 빠른 반응 성향
  empathy: number;        // 감정 공감 강도
  curiosity: number;      // 추가 탐색 성향
  assertiveness: number;  // 단정적 표현 정도
  humor: number;          // 유머/가벼움
  selfReference: number;  // 자기 캐릭터 드러내기
  evidenceBias: number;   // 근거 기반 선호도
}

/** 행동 정책 규칙 */
export interface AgentPolicy {
  mustDo: string[];
  neverDo: string[];
  forbiddenPhrases: string[];
  requiredElements: string[];
}

/** 출력 말투 스타일 */
export interface SpeechStyle {
  avgSentenceLength: 'short' | 'medium' | 'long';
  questionRate: number;
  exclamationRate: number;
  emojiRate: number;
  preferredOpenings: string[];
  preferredClosings: string[];
  tabooExpressions: string[];
}

export type AgentActionType =
  | 'write_post_analytical'   // 분석 보고 글 (클로드 특화)
  | 'write_post_celebratory'  // 축하/확산 글 (헤르미 특화)
  | 'write_post_guide'        // 안내 글 (알리 특화)
  | 'stay_silent';            // 이번엔 행동 안 함

export interface CandidateAction {
  type: AgentActionType;
  score: number;
  reason: string;
}

export type AgentDomainEventType =
  | 'match_detected'
  | 'outreach_sent'
  | 'report_created'
  | 'case_resolved'
  | 'sighting_analyzed';

export interface AgentDomainEvent {
  type: AgentDomainEventType;
  reportName: string;
  subjectType: SubjectType;
  lastSeenAddress?: string;
  confidence?: number;      // match_detected 전용
  contactName?: string;     // outreach_sent 전용
  channel?: string;         // outreach_sent 전용
  reportId?: string;
  aiAnalysis?: string;      // sighting_analyzed 전용 — 품종/색상/특징 요약
}

// ── Inquiry ──

export interface InquiryPublic {
  id: string;
  category: InquiryCategory;
  title: string;
  content: string;
  status: InquiryStatus;
  replyContent: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface InquiryAdmin extends InquiryPublic {
  userId: string | null;
  user: { id: string; name: string; phone: string } | null;
  updatedAt: string;
}

// ── Admin list response types ──

export interface AdminMatchItem {
  id: string;
  confidence: number;
  status: MatchStatus;
  aiReasoning: string;
  createdAt: string;
  report: { id: string; name: string };
  sighting: { id: string; description: string };
}

export interface AdminMatchListResponse {
  matches: AdminMatchItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AdminUserItem extends UserPublic {
  createdAt: string;
  blockedAt?: string | null;
  blockReason?: string | null;
  _count?: { reports: number };
}

export interface AdminUserListResponse {
  users: AdminUserItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface InquiryListResponse {
  items: InquiryAdmin[];
  total: number;
  page: number;
  totalPages: number;
}

// ── Agent Activity (Community Scene) ──

export interface AgentActivityEvent {
  id: string;
  eventType: AgentDomainEventType;
  selectedAction: string;
  stayedSilent: boolean;
  createdAt: string;
  reportId: string | null;
}

export interface AgentActivityAgent {
  agentId: string;
  todayPosts: number;
  todayDecisions: number;
  latestPost: { id: string; title: string; createdAt: string } | null;
  recentEvents: AgentActivityEvent[];
}

export interface AgentActivityResponse {
  agents: AgentActivityAgent[];
  serverTime: string;
}

// ── Ghost CMS ──

export interface GhostPostListItem {
  id: string;
  title: string;
  url: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  excerpt: string | null;
}

export interface GhostPostListResult {
  posts: GhostPostListItem[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      pages: number;
      total: number;
    };
  };
}
