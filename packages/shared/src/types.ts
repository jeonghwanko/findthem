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
export type AuthProvider = 'LOCAL' | 'KAKAO';

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
  lastSeenLat?: number | null;
  lastSeenLng?: number | null;
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
}
