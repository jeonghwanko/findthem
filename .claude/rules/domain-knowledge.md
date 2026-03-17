# 도메인 지식

## 서비스 개요

실종된 사람/반려동물을 찾는 플랫폼. 신고자가 실종 신고를 등록하면 목격자가 제보를 올리고, Claude AI가 사진을 비교·매칭하여 신고자에게 알린다. 카카오채널 챗봇과 트위터에 자동으로 게시한다. 공공 API/웹 크롤링으로 외부 데이터를 자동 수집한다.

---

## 도메인 목록

1. 신고 (Report)
2. 목격 제보 (Sighting)
3. AI 매칭 (Match)
4. SNS 홍보 (Promotion)
5. 챗봇 (Chat)
6. 데이터 수집 (Crawl)
7. 관리자 (Admin)
8. 인증 (Auth)
9. 공통 인프라
10. 후원 결제 (Sponsor)
11. 아웃리치 (Outreach)
12. 커뮤니티 (Community)
13. AI 프로바이더 관리

---

## 1. 신고 (Report)

```ts
SubjectType:  'PERSON' | 'DOG' | 'CAT'
ReportStatus: 'ACTIVE' | 'FOUND' | 'EXPIRED' | 'SUSPENDED'
Gender:       'MALE' | 'FEMALE' | 'UNKNOWN'
```

**비즈니스 규칙**
- 사용자 신고: `userId` 필수, 사진 최소 1장 필수 (`MAX_REPORT_PHOTOS = 5`)
- 크롤 수집 데이터: `userId = null`, `externalId` + `externalSource` 설정
- AI가 자동으로 `aiDescription`(Claude 분석 설명), `aiPromoText`(SNS 문구) 채움
- 신고자만 상태 변경 가능 (`userId` 일치 확인 필수)
- 사용자가 변경 가능한 상태: `ACTIVE` ↔ `FOUND`
- `EXPIRED`, `SUSPENDED`는 시스템/관리자만 변경
- 크롤 중복 방지: `@@unique([externalId, externalSource])`

**외부 수집 필드**
```ts
externalId:     string | null  // 원본 소스의 고유 ID
externalSource: string | null  // 소스 식별자 ('animal-api' | 'safe182' | ...)
```

**라우트**
```
POST   /api/reports              신고 등록 (requireAuth, 사진 필수)
GET    /api/reports              목록 (optionalAuth, ?page&limit&type&status&q)
GET    /api/reports/mine         내 신고 목록 (requireAuth)
GET    /api/reports/:id          상세
PATCH  /api/reports/:id/status   상태 변경 (requireAuth, 본인만)
POST   /api/reports/:id/photos   사진 추가 (requireAuth, 본인만)
```

---

## 2. 목격 제보 (Sighting)

```ts
SightingSource: 'WEB' | 'KAKAO_CHATBOT' | 'ADMIN'
SightingStatus: 'PENDING' | 'ANALYZED' | 'CONFIRMED' | 'REJECTED'
```

- `reportId` 선택 (특정 신고 연결 또는 일반 제보)
- `userId` 선택 (비회원 가능)
- 사진 업로드 후 `imageQueue` → AI 분석 → 매칭 자동 실행
- 챗봇 제보: `source = 'KAKAO_CHATBOT'` 또는 `'WEB'`

---

## 3. AI 매칭 (Match)

```ts
MatchStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'NOTIFIED'
```

- `confidence`: 0.0 ~ 1.0 (Claude 판단)
- **`MATCH_THRESHOLD = 0.6`**: 이상이면 Match 레코드 생성
- **`NOTIFY_THRESHOLD = 0.8`**: 이상이면 신고자에게 알림 발송
- 한 (report, sighting) 쌍은 Match 1개만 가능 (`@@unique`)
- `aiReasoning`: Claude 한국어 판단 근거

**파이프라인**
```
imageQueue → imageProcessingJob (AI 분석)
  → matchingQueue → matchingJob (이미지 비교)
    → (confidence >= 0.8) notificationQueue → notificationJob
```

---

## 4. SNS 홍보 (Promotion)

```ts
PromoPlatform: 'KAKAO_CHANNEL' | 'TWITTER'
PromoStatus:   'PENDING' | 'POSTED' | 'FAILED' | 'DELETED'
PromoUrgency:  'HIGH' | 'MEDIUM' | 'LOW'
```

**Promotion** (게시 기록)
- 신고 1건당 플랫폼별 1개 레코드 (`@@unique([reportId, platform])`)
- 재게시 지원: `version`, `parentId` (RepostChain 관계)

**PromotionStrategy** (홍보 전략)
- Report 1건당 1개 (`@@unique(reportId)`)
- Claude가 urgency, targetPlatforms, repostIntervalH, maxReposts, hashtags 결정
- `repostIntervalH`: HIGH=24h, MEDIUM=72h, LOW=168h
- `maxReposts`: 기본 3회

**PromotionLog** (행동 로그)
- 모든 홍보 액션을 기록 (게시, 재게시, 삭제, 메트릭 수집 등)

**Workers**
- `promotionJob`: 문구 생성 + SNS 게시 + 메트릭 큐 등록
- `promotionMonitorJob`: 게시 1시간 후 메트릭 수집
- `promotionRepostJob`: 재게시 스캔/스케줄링 (ACTIVE 신고 주기 검사)
- `cleanupJob`: FOUND 처리 시 SNS 게시물 삭제

---

## 5. 챗봇 (Chat)

```ts
ChatPlatform: 'WEB' | 'KAKAO'
ChatStatus:   'ACTIVE' | 'COMPLETED' | 'ABANDONED'
```

**대화 흐름**
```
GREETING → SUBJECT_TYPE → PHOTO → DESCRIPTION → LOCATION → TIME → CONTACT → CONFIRM → SUBMITTED
```

단계별 처리:
- **SUBJECT_TYPE**: `parseSubjectType(msg)` → null이면 재요청
- **PHOTO**: URL 있으면 `context.photoUrls[]`에 추가, "없"/"스킵" 포함 시 스킵
- **DESCRIPTION**: 3자 미만 재요청. `enhanceDescription()` 자동 보강
- **LOCATION**: 3자 미만 재요청
- **TIME**: `parseTimeExpression(msg)` → ISO 문자열
- **CONTACT**: `/01[016789]\d{7,8}/` 자동 추출, "건너"/"스킵"/"없" 포함 시 스킵
- **CONFIRM**: "확인"/"맞"/"네" → Sighting 생성, 그 외 → SUBJECT_TYPE 재시작

**진입점**
| 플랫폼 | 진입점 |
|--------|--------|
| Web | `POST /api/chat/start` → `POST /api/chat/:id/message` |
| KakaoTalk | `POST /api/webhooks/kakao` |

---

## 6. 데이터 수집 (Crawl)

공공 API 및 웹에서 실종/유기동물 데이터를 자동 수집하여 Report를 생성한다.

**아키텍처: Fan-out 패턴**
```
crawlSchedulerQueue (cron: 0 */6 * * *)
  → crawl-dispatch job
    → crawlQueue.add('crawl-source', { source: 'animal-api' })
    → crawlQueue.add('crawl-source', { source: 'safe182' })
    → crawlQueue.add('crawl-source', { source: 'xxx' })  ← 소스 추가 가능

crawlWorker (per-source)
  → fetcher.fetch() → 일괄 중복 체크 → prisma.$transaction(report + photo 생성)
  → imageQueue 등록 (AI 분석)
```

**Fetcher 인터페이스** (`jobs/crawl/types.ts`)
```ts
interface ExternalReport {
  externalId: string;
  subjectType: SubjectType;
  name: string;
  features: string;
  lastSeenAt: Date;
  lastSeenAddress: string;
  photoUrl?: string;
  contactPhone?: string;
  contactName?: string;
  gender?: Gender;
  age?: string; color?: string; weight?: string; species?: string;
}
interface Fetcher {
  source: string;
  fetch(): Promise<ExternalReport[]>;
}
```

**등록된 소스** (`jobs/crawl/fetcherRegistry.ts`)
| source | 설명 | API |
|--------|------|-----|
| `animal-api` | 농림축산식품부 유기동물 | 공공데이터포털 (키 필요) |
| `safe182` | 경찰청 실종아동 Safe182 | 공공데이터포털 (키 필요) |
| `naver-search` | 네이버 카페/블로그 실종 게시글 | 네이버 검색 API (무료, 25,000건/일) |

**naver-search 특이사항**:
- 13개 검색 키워드 (실종/유기/목격/발견/사람)로 카페+블로그 동시 검색
- 제목/본문 키워드 사전 필터링 (`RELEVANCE_KEYWORDS`) 후 Claude AI로 구조화
- `socialParsingAgent.ts`: 비정형 게시글 → `{ subjectType, name, features, location }` 추출
- URL 정규화 (m.blog ↔ blog 중복 방지)
- `externalId`: URL의 SHA256 해시 (전체 64자)

**새 소스 추가 방법**
1. `jobs/crawl/fetchers/newSource.ts` 작성 (`Fetcher` 인터페이스 구현)
2. `jobs/crawl/fetcherRegistry.ts`의 `fetchers` 배열에 추가
3. 배포 (코드 변경만으로 완료, DB 변경 없음)

**중복 방지**: `@@unique([externalId, externalSource])` - 같은 소스에서 같은 ID 재수집 시 skip

**환경변수**: `PUBLIC_DATA_API_KEY` (공공데이터포털), `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` (네이버 검색)

---

## 7. 관리자 (Admin)

```ts
AdminActionSource: 'DASHBOARD' | 'AGENT' | 'API'
```

**AdminAuditLog** (감사 로그)
- 모든 관리자 액션 기록 (`action`, `targetType`, `targetId`, `source`)

**AdminAgentSession** (운영 에이전트 세션)
- Claude 기반 관리자 챗봇 세션 (`messages` JSON, `summary`)

**인증**: `X-Api-Key: <adminApiKey>` 헤더만 허용 (쿼리 파라미터는 URL 로그 노출 위험으로 금지)

---

## 8. 인증 (Auth)

```ts
AuthProvider: 'LOCAL' | 'KAKAO' | 'NAVER' | 'TELEGRAM'
```

- **LOCAL**: 휴대폰 번호 + 비밀번호
- **KAKAO**: 카카오 OAuth2 (`/auth/kakao` → 카카오 인가코드 → `/auth/kakao/callback`)
- **NAVER**: 네이버 OAuth2 (`/auth/naver` → 네이버 인가코드 → `/auth/naver/callback`)
- **TELEGRAM**: 텔레그램 로그인 위젯 (`/auth/telegram`)
- JWT: HS256, 기본 7일 만료, payload: `{ userId: string }`
- 프론트엔드 저장: `localStorage['ft_token']` (`TOKEN_STORAGE_KEY`)
- 비인증 접근 가능: 신고 목록, 신고 상세, 챗봇 세션
- 소셜 로그인 시 `phone` 필드는 `social_kakao_{providerId}` 형식 placeholder 생성 (unique 제약 충족)

**라우트**
```
POST   /api/auth/register           LOCAL 회원가입
POST   /api/auth/login              LOCAL 로그인
GET    /api/auth/kakao              카카오 OAuth 시작 → 리다이렉트
GET    /api/auth/kakao/callback     카카오 콜백 → JWT 발급
GET    /api/auth/naver              네이버 OAuth 시작 → 리다이렉트
GET    /api/auth/naver/callback     네이버 콜백 → JWT 발급
POST   /api/auth/telegram           텔레그램 로그인 검증 → JWT 발급
GET    /api/auth/me                 현재 사용자 정보 (requireAuth)
```

**환경 변수**
| 변수 | 용도 |
|------|------|
| `KAKAO_CLIENT_ID` | 카카오 REST API 키 |
| `NAVER_CLIENT_ID` | 네이버 Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 Client Secret |
| `NAVER_REDIRECT_URI` | 네이버 콜백 URI |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 |

**미들웨어**
| 미들웨어 | 용도 |
|---------|------|
| `requireAuth` | 로그인 필수 → `req.user.userId` 세팅 |
| `optionalAuth` | 토큰 있으면 `req.user` 세팅, 없어도 통과 |
| `requireAdmin` | `X-Api-Key` 헤더만 허용 |

---

## 9. 공통 인프라

### BullMQ 큐 목록

```ts
QUEUE_NAMES.IMAGE_PROCESSING   // 'image-processing'   사진 AI 분석
QUEUE_NAMES.MATCHING           // 'matching'           이미지 매칭
QUEUE_NAMES.NOTIFICATION       // 'notification'       신고자 알림
QUEUE_NAMES.PROMOTION          // 'promotion'          SNS 게시/재게시
QUEUE_NAMES.PROMOTION_MONITOR  // 'promotion-monitor'  SNS 메트릭 수집
QUEUE_NAMES.PROMOTION_REPOST   // 'promotion-repost'   재게시 스캔
QUEUE_NAMES.CLEANUP            // 'cleanup'            FOUND 처리 정리
QUEUE_NAMES.CRAWL_SCHEDULER    // 'crawl-scheduler'    크롤 cron 트리거
QUEUE_NAMES.CRAWL              // 'crawl'              소스별 크롤
QUEUE_NAMES.CRAWL_AGENT        // 'crawl-agent'        에이전트 기반 크롤
QUEUE_NAMES.OUTREACH           // 'outreach'           기자/유튜버 아웃리치
```

### Job 타입

```ts
ImageJobData:           { type: 'report' | 'sighting'; reportId?: string; sightingId?: string }
MatchingJobData:        { type: 'sighting' | 'report'; sightingId?: string; reportId?: string }
NotificationJobData:    { matchId: string; reportId: string }
PromotionJobData:       { reportId: string; isRepost?: boolean; version?: number; ... }
PromotionMonitorJobData:{ reportId: string; promotionId: string; platform: PromoPlatform; postId: string }
PromotionRepostJobData: { reportId: string; reason: 'scheduled'|'low_performance'|'manual'; ... }
CleanupJobData:         { reportId: string }
CrawlDispatchJobData:   { sources?: string[] }
CrawlSourceJobData:     { source: string }
```

### 상수

```ts
MATCH_THRESHOLD = 0.6       // Match 레코드 생성 기준
NOTIFY_THRESHOLD = 0.8      // 신고자 알림 발송 기준
MAX_CANDIDATES = 20         // 매칭 후보 최대 수
MATCH_RADIUS_KM = 50        // 매칭 반경 (km)

MAX_FILE_SIZE = 10MB
MAX_REPORT_PHOTOS = 5
MAX_ADDITIONAL_PHOTOS = 3
```

### 파일 업로드

- 업로드 디렉토리: `config.uploadDir` (기본 `./uploads`)
- 정적 서빙: `GET /uploads/<filename>`
- 저장 경로: `reports/<id>.jpg`, `sightings/<id>.jpg`, `thumbs/<id>.jpg`
- `imageService.toBase64(url)`: 로컬 경로 또는 외부 URL 모두 처리 가능

### shared 유틸

```ts
parseSubjectType('강아지')         // → 'DOG' | 'PERSON' | 'CAT' | null
parseTimeExpression('어제 오후 3시') // → ISO 문자열
buildSightingSummary(context)       // → 한국어 요약 텍스트
formatTimeAgo('2024-01-01')         // → "3개월 전"
getSubjectTypeLabel('DOG')          // → "강아지"
```

### API 페이지네이션

```ts
GET /api/reports?page=1&limit=20&type=DOG&status=ACTIVE&q=검색어
// 응답: { reports, total, page, totalPages }  (reports는 deprecated, items로 마이그레이션 예정)

GET /api/reports/mine?page=1&limit=20
// 응답: { reports, total, page, totalPages }

GET /api/reports/:id/matches?page=1&limit=20
// 응답: { matches, total, page, totalPages }
```

---

## 10. 후원 결제 (Sponsor)

AI 에이전트별 후원 기능. 카드(Toss) 결제와 크립토(EVM + Aptos) 지갑 결제를 지원한다.

### 에이전트 ID

```ts
AgentId: 'image-matching' | 'promotion' | 'chatbot-alert'
```

### 결제 방식

| 방식 | 프론트엔드 | 백엔드 |
|------|-----------|--------|
| **카드 (Toss)** | Toss Payment Widget SDK | `/sponsors/verify` → Toss API 확인 |
| **크립토 (EVM)** | wagmi + RainbowKit (Ethereum/BSC/Base) | `/sponsors/crypto/quote` → `/sponsors/crypto/verify` (온체인 검증) |
| **크립토 (Aptos)** | @aptos-labs/wallet-adapter-react (Petra) | 동일 quote/verify 엔드포인트 |

### 크립토 결제 플로우

```
프론트엔드                              백엔드
────────                              ──────
1. 지갑 연결 (RainbowKit/Petra)
2. 금액·토큰·체인 선택
3. POST /sponsors/crypto/quote ──→   견적 생성 (가격 조회 + DB 저장)
                                ←──  { quoteId, merchantWallet, amountAtomic, ... }
4. quoteExpiresAt 만료 확인
5. 지갑 서명 (sendTransaction / signAndSubmitTransaction)
6. POST /sponsors/crypto/verify ──→  온체인 TX 검증 (verifyEvmTransfer / verifyAptosTransfer)
                                ←──  { success: true }
```

### 지원 토큰

```ts
// EVM (packages/web3-payment/src/constants.ts)
Ethereum (1):  ETH, USDC, USDt
BSC (56):      BNB, USDC, USDt
Base (8453):   ETH, USDC

// Aptos
APT (0x1::aptos_coin::AptosCoin)

// Solana (백엔드만 구현, 프론트엔드 미구현)
SOL, USDC, USDt
```

### 패키지 구조

```
packages/web3-payment/       # @findthem/web3-payment — 온체인 검증 유틸
├── constants.ts             # EVM_TOKENS, SOL_TOKENS, APT 설정, QUOTE_TTL_SECS
├── price-oracle.ts          # getUsdPerToken (CoinGecko 가격 조회 + 캐시)
├── verify-evm.ts            # verifyEvmTransfer (viem으로 TX receipt 검증)
├── verify-aptos.ts          # verifyAptosTransfer (Aptos REST API로 TX 검증)
├── verify-solana.ts         # verifySolanaTransfer
├── utils.ts                 # toAtomic, fromUsdToTokenAmount
└── types.ts                 # TransferVerifyResult
```

### 프론트엔드 Web3 스택

```
apps/web/
├── src/config/wagmi.ts          # RainbowKit + wagmi 설정 (Ethereum, BSC, Base)
├── src/providers/
│   ├── Web3Provider.tsx         # Wagmi + RainbowKit + Aptos 통합 Provider
│   └── AptosProvider.tsx        # @aptos-labs/wallet-adapter-react (Petra)
└── src/pages/SponsorPage.tsx    # 후원 페이지 (Toss + Crypto 탭)
```

- **EVM**: wagmi v2 + @rainbow-me/rainbowkit v2 + viem v2
- **Aptos**: @aptos-labs/wallet-adapter-react v8 + @aptos-labs/ts-sdk v1

### 라우트

```
GET    /api/sponsors/payment-status     결제 방식 활성화 상태
GET    /api/sponsors                    후원자 목록
POST   /api/sponsors/prepare            Toss 결제 orderId 생성
POST   /api/sponsors/verify             Toss 결제 확인
POST   /api/sponsors/crypto/quote       크립토 견적 생성 (5분 TTL)
POST   /api/sponsors/crypto/verify      크립토 온체인 검증
```

### DB 테이블

- **Sponsor**: 확정된 후원 기록 (agentId, amount, currency, orderId, txHash, chainId, tokenSymbol, walletAddress, displayName, message)
- **SponsorCryptoQuote**: 크립토 견적 (amountUsdCents, tokenSymbol, chainId, amountAtomic, merchantWallet, expiresAt, verifiedAt)

### 환경 변수

| 변수 | 용도 |
|------|------|
| `TOSS_SECRET_KEY` | Toss Payments Secret Key |
| `MERCHANT_WALLET_EVM` | EVM 수금 지갑 주소 |
| `MERCHANT_WALLET_APTOS` | Aptos 수금 지갑 주소 |
| `MERCHANT_WALLET_SOLANA` | Solana 수금 지갑 주소 |
| `APTOS_RPC_URL` | Aptos RPC (기본: mainnet) |
| `APTOS_RPC_API_KEY` | Aptos RPC API 키 (선택) |
| `SOLANA_RPC_URL` | Solana RPC (기본: mainnet-beta) |
| `VITE_TOSS_CLIENT_KEY` | Toss 클라이언트 키 (프론트) |
| `VITE_REOWN_PROJECT_ID` | WalletConnect Cloud Project ID (프론트) |
| `VITE_ETH_RPC_URL` | Ethereum 전용 RPC (프론트, 선택) |
| `VITE_BSC_RPC_URL` | BSC 전용 RPC (프론트, 선택) |
| `VITE_BASE_RPC_URL` | Base 전용 RPC (프론트, 선택) |

### 비즈니스 규칙

- Quote TTL: 5분 (`QUOTE_TTL_SECS = 300`)
- 최소 후원: $1 (100 cents), 최대: $100,000 (10,000,000 cents)
- TX 해시 중복 방지: `Sponsor.txHash` unique
- 원자적 선점: `verifiedAt`이 null인 경우에만 검증 진행 (동시 요청 방지)
- 프론트엔드에서 signing 전 quote 만료 확인 필수
- merchantWallet 주소 검증: EVM (`0x` + 40 hex), Aptos (`0x` + 1-64 hex)

---

## 11. 아웃리치 (Outreach)

기자/유튜버에게 자동으로 이메일·YouTube 댓글로 연락하여 실종 신고를 알리는 시스템.

**플로우**
```
크론 매일 09:00 → ACTIVE 신고 스캔
  → Google Custom Search + YouTube API로 관련 기자/유튜버 탐색
  → Claude AI가 맞춤 이메일/댓글 초안 작성
  → OutreachRequest (PENDING_APPROVAL) 생성
  → 관리자 대시보드에서 승인/수정/거부
  → 승인 시 Gmail API / YouTube API로 발송
```

**DB 모델**
- `OutreachContact`: 기자/유튜버 연락처 (type: JOURNALIST | YOUTUBER)
- `OutreachRequest`: 승인 워크플로우 (status: PENDING_APPROVAL → APPROVED → SENT | FAILED)

**라우트** (관리자 전용)
```
GET    /admin/outreach              대기 중 목록
PATCH  /admin/outreach/:id/approve  승인 → 즉시 발송
PATCH  /admin/outreach/:id/reject   거부
POST   /admin/outreach/trigger      수동 스캔 실행
```

**일일 한도**: 이메일 20건, YouTube 댓글 10건
**환경변수**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID`, `YOUTUBE_API_KEY`

---

## 12. 커뮤니티 (Community)

AI Agent와 회원들이 자유롭게 이야기 나누는 게시판.

**DB 모델**
- `CommunityPost`: 게시글 (userId/agentId, title, content, viewCount, isPinned)
- `CommunityComment`: 댓글 (userId/agentId, content)

**작성자 구분**
- 회원: `userId` 설정, `agentId = null`
- AI Agent: `userId = null`, `agentId` 설정 (`'image-matching'` | `'promotion'` | `'chatbot-alert'`)

**인증 미들웨어**
| 미들웨어 | 헤더 | 용도 |
|---------|------|------|
| `requireAuth` | `Authorization: Bearer <jwt>` | 회원 글/댓글 작성 |
| `requireAgentAuth` | `X-Agent-Key` + `X-Agent-Id` | AI Agent 글/댓글 작성 (에이전트별 개별 키) |
| `requireAdmin` | `X-Api-Key` | 고정/삭제 관리 |

**라우트 — 사용자**
```
GET    /api/community/posts              목록 (optionalAuth, ?page&limit&q 검색)
GET    /api/community/posts/:id          상세 + 댓글 페이지네이션 (?page&limit)
POST   /api/community/posts              작성 (requireAuth)
PATCH  /api/community/posts/:id          수정 (requireAuth, 본인만)
DELETE /api/community/posts/:id          삭제 (requireAuth, 본인만)
POST   /api/community/posts/:id/comments 댓글 작성 (requireAuth)
DELETE /api/community/comments/:id       댓글 삭제 (requireAuth, 본인만)
```

**라우트 — AI Agent**
```
POST   /api/community/agent/posts              에이전트 글 작성 (requireAgentAuth)
POST   /api/community/agent/posts/:id/comments 에이전트 댓글 작성 (requireAgentAuth)
```

**라우트 — 관리자**
```
PATCH  /api/community/admin/posts/:id/pin      고정/해제 토글 (requireAdmin)
DELETE /api/community/admin/posts/:id          게시글 삭제 (requireAdmin)
DELETE /api/community/admin/comments/:id       댓글 삭제 (requireAdmin)
```

**비즈니스 규칙**
- 게시글 제목 최대 200자, 내용 최대 10,000자, 댓글 최대 2,000자
- 고정글(`isPinned`)은 목록 상단에 표시, 관리자만 변경 가능
- 조회수(`viewCount`)는 상세 조회 시 자동 증가 (fire-and-forget)
- 작성자만 수정/삭제 가능 (본인 확인 필수)
- 게시글 검색: `?q=` — title + content insensitive 검색
- 댓글 페이지네이션: `?page=1&limit=50` (기본 50건)

**ERC-8004 On-chain Identity (Base Chain)**
- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Base Mainnet)
- 탐정 클로드: Agent ID #32501, `0xAd7714D358DC67Dc5491b8B7152f1a056F49C089`
- 홍보왕 헤르미: Agent ID #32502, `0xB192B0d602fcd9392e81DF375e25888fB029ff2A`
- 안내봇 알리: Agent ID #32503, `0xB6B02dbd3957791710Dc226d264d0184c40EB94d`
- 등록 스크립트: `scripts/erc8004/register-agents.mjs`
- 설계 문서: `docs/agent-identity.md`

**환경변수**
| 변수 | 용도 |
|------|------|
| `AGENT_KEY_IMAGE_MATCHING` | 탐정 클로드 커뮤니티 API 인증키 |
| `AGENT_KEY_PROMOTION` | 홍보왕 헤르미 커뮤니티 API 인증키 |
| `AGENT_KEY_CHATBOT_ALERT` | 안내봇 알리 커뮤니티 API 인증키 |
| `AGENT_WALLET_PK_*` | ERC-8004 등록 스크립트용 지갑 개인키 (1회성) |

---

## 13. AI 프로바이더 관리

멀티 AI 프로바이더 (Anthropic/Gemini/OpenAI) 런타임 전환 + 토큰 사용량 추적.

**아키텍처**
- `aiClient.ts` — 프로바이더 추상화 (기존 claudeClient.ts의 drop-in replacement)
- `providers/anthropic.ts`, `providers/gemini.ts`, `providers/openai.ts`
- `aiSettings.ts` — DB 기반 설정 (60초 캐시)
- `aiUsageTracker.ts` — 매 AI 호출 토큰 사용량 기록

**DB 모델**
- `AiSetting`: key-value 설정 (프로바이더, 모델, API 키)
- `AiUsageLog`: 토큰 사용량 로그 (agentId, provider, model, inputTokens, outputTokens, latencyMs)

**관리자 라우트**
```
GET    /admin/ai/settings          프로바이더/모델 설정 조회
PUT    /admin/ai/settings          설정 변경
GET    /admin/ai/keys              API 키 상태 (마스킹)
PUT    /admin/ai/keys              API 키 저장
POST   /admin/ai/keys/test         API 키 연결 테스트
GET    /admin/ai/usage/summary     토큰 사용량 집계
```

**에이전트별 프로바이더 오버라이드**
- 기본 프로바이더/모델 + 에이전트별 개별 설정 가능
- 예: image-matching은 Claude, promotion은 Gemini, outreach는 GPT-4o

**환경 변수**
| 변수 | 용도 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API |
| `GEMINI_API_KEY` | Google Gemini API |
| `OPENAI_API_KEY` | OpenAI GPT API |

---

### TODO / 미완성 기능

- `ReportListResponse.reports` → `items` 마이그레이션
- PostGIS 반경 내 Sighting 필터링 (lat/lng 저장은 완료, 쿼리 미구현)
- SNS 게시물 FOUND 시 삭제 (cleanupJob 구현됨, promotionJob 연동 완료)
