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
export type PromoPlatform = 'KAKAO_CHANNEL' | 'TWITTER';
export type PromoStatus = 'PENDING' | 'POSTED' | 'FAILED' | 'DELETED';
export type ChatPlatform = 'WEB' | 'KAKAO';
export type ChatStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
export type AuthProvider = 'LOCAL' | 'KAKAO' | 'NAVER' | 'TELEGRAM';

// ── API 응답 타입 ──

export interface UserPublic {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
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

export type SupportedPayToken = 'APT' | 'USDC' | 'USDt' | 'ETH' | 'BNB' | 'SOL';

export interface CryptoQuoteResult {
  quoteId: string;
  merchantWallet: string;
  amountAtomic: string;
  tokenSymbol: SupportedPayToken;
  chainId: number | null;
  tokenContract: string | null;
  quoteExpiresAt: string;
}
