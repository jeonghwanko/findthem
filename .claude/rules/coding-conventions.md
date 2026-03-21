# 코딩 컨벤션

## TypeScript

- strict 모드 필수 (`tsconfig.base.json` 상속, target ES2022, module NodeNext)
- **백엔드/shared**: 파일 임포트 시 `.js` 확장자 필수 (ESM + NodeNext 모듈 시스템)
  ```ts
  import { config } from './config.js';     // ✅
  import { config } from './config';         // ❌
  ```
- **프론트엔드**: `.js` 확장자 불필요 (Vite bundler 모드, `moduleResolution: bundler`)
- `any` 타입 금지 (ESLint `no-explicit-any: error`). 불가피한 경우 `unknown` + 타입 가드 사용
- 공유 타입은 `packages/shared/src/types.ts`에 정의하고 `@findthem/shared`로만 임포트
- **프론트엔드에서 로컬 타입 재정의 금지** — shared에 있는 타입을 apps/web에서 다시 선언하면 SSOT 위반
  - `ExternalAgentPublic` (공개용) / `ExternalAgentAdmin` (관리자용) → `@findthem/shared`에서 import

## Express 라우터 패턴

라우트는 `register*Routes(router: Router)` 함수로 정의하고 `routes/index.ts`에서 등록:

```ts
// routes/reports.ts
export function registerReportRoutes(router: Router) {
  router.post('/reports', requireAuth, upload.array('photos', 5), async (req, res) => {
    // ...
  });
}
```

**주의**: 정적 경로(`/reports/mine`)는 반드시 동적 경로(`/reports/:id`)보다 먼저 등록해야 함.

## 인증 미들웨어

| 미들웨어 | 용도 |
|---------|------|
| `requireAuth` | 로그인 필수 → `req.user.userId` 세팅 |
| `optionalAuth` | 로그인 선택 → 토큰 있으면 `req.user` 세팅, 없어도 통과 |
| `requireAdmin` | 관리자 전용 → `X-Api-Key` 헤더만 허용 (쿼리 파라미터는 URL 로그 노출 위험으로 금지) |

```ts
// 토큰: Authorization: Bearer <jwt>
// 어드민: X-Api-Key: <adminApiKey>
```

## 로깅 (pino)

`console.log/warn/error` 직접 사용 금지 (ESLint `no-console: error`). 반드시 `logger.ts`의 pino 로거 사용:

```ts
import { createLogger } from '../logger.js';
const log = createLogger('matchingJob');

// ✅ 올바른 패턴
log.info({ reportId, matchCount }, 'Matching completed');
log.warn({ sessionId }, 'Session expired');
log.error({ err }, 'Failed to process image');

// ❌ 금지 패턴
console.log('Matching completed');
console.error(err);
```

- 에러 객체는 `{ err }` 키로 전달 (pino가 스택 트레이스 자동 직렬화)
- 구조화된 데이터를 첫 번째 인자로, 메시지를 두 번째 인자로
- 모듈 이름은 파일명 기반: `createLogger('imageProcessingJob')`

## 에러 처리

`ApiError` 클래스 사용. `express-async-errors`가 async 핸들러의 throw를 자동 캐치:

```ts
import { ApiError } from '../middlewares/errors.js';
import { ERROR_CODES } from '@findthem/shared';

// ✅ 올바른 패턴 — 에러 코드 상수 사용 (프론트에서 i18n 번역)
if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
if (report.userId !== req.user!.userId) throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);

// ❌ 금지 — 한국어/영어 문자열 직접 사용
throw new ApiError(404, '신고를 찾을 수 없습니다.');
throw new ApiError(404, 'Report not found');

// errorHandler 응답:
// ApiError → { error: errorCode } + statusCode
// ZodError → { error: "field: message" } + 400
// 기타    → { error: "SERVER_ERROR" } + 500
```

## Rate Limiting

`express-rate-limit` 미들웨어로 엔드포인트별 요청 제한:

| Limiter | 대상 | 제한 |
|---------|------|------|
| `authLimiter` | 로그인/회원가입 | 15분에 15회 |
| `sightingLimiter` | 목격 제보 (`POST /sightings`) | 15분에 10회 |

비로그인 엔드포인트에는 반드시 IP 기반 rate limiter 적용. 새 공개 POST 엔드포인트 추가 시 limiter 적용 필수.

## 유효성 검사 (Zod)

- body 검증: `validateBody(schema)` 미들웨어
- query 검증: `validateQuery(schema)` 미들웨어
- multer 이후 body 검증: `schema.parse(JSON.parse(req.body.data))` 패턴 (FormData)

```ts
// query 예시
router.get('/reports', validateQuery(listQuerySchema), async (req, res) => {
  const { page, limit, type } = req.query as z.infer<typeof listQuerySchema>;
});

// multer + JSON body 패턴
const body = createReportSchema.parse(
  typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body,
);
```

## 파일 업로드 (Multer)

```ts
const upload = multer({
  storage: multer.memoryStorage(),          // 메모리에 저장 후 Sharp 처리
  limits: { fileSize: MAX_FILE_SIZE },      // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('IMAGE_ONLY'));        // errorHandler에서 처리
  },
});
// 신고 등록: upload.array('photos', MAX_REPORT_PHOTOS)  → 최대 5장
// 추가 사진: upload.array('photos', MAX_ADDITIONAL_PHOTOS) → 최대 3장
```

처리 후 `imageService.processAndSave('reports' | 'sightings', file)` 호출 → `{ photoUrl, thumbnailUrl }` 반환.

## Prisma 쿼리 패턴

### 페이지네이션 — shared 상수 사용 필수

```ts
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@findthem/shared';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
// ❌ .max(50).default(20) — 매직넘버 금지
```

### 일반 쿼리

```ts
import { prisma } from '../db/client.js';

// 목록 조회 + 카운트 (동시 실행)
const [reports, total] = await Promise.all([
  prisma.report.findMany({ where, include, orderBy, skip, take }),
  prisma.report.count({ where }),
]);

// 관계 포함 조회
prisma.report.findMany({
  include: {
    photos: { where: { isPrimary: true }, take: 1 },  // 대표 사진만
    _count: { select: { sightings: true, matches: true } },
  },
});

// 없으면 404
const report = await prisma.report.findUnique({ where: { id } });
if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
```

### 읽기-확인-쓰기 패턴 (레이스 컨디션 방지)

`count/findUnique → 조건 검사 → create` 사이에 다른 요청이 끼어들 수 있는 경우 **반드시 `$transaction`으로 원자적 처리**:

```ts
// ❌ 위험 — check-then-act (동시 요청 시 한도 초과 가능)
const count = await prisma.promotionLog.count({ where: { action: 'ad_boost', ... } });
if (count >= MAX_BOOSTS_PER_DAY) throw new ApiError(429, ERROR_CODES.BOOST_LIMIT_REACHED);
await prisma.promotionLog.create({ data: { action: 'ad_boost', ... } });

// ✅ 안전 — $transaction으로 count + create 원자적 처리
await prisma.$transaction(async (tx) => {
  const count = await tx.promotionLog.count({ where: { action: 'ad_boost', ... } });
  if (count >= MAX_BOOSTS_PER_DAY) throw new ApiError(429, ERROR_CODES.BOOST_LIMIT_REACHED);
  await tx.promotionLog.create({ data: { action: 'ad_boost', ... } });
});
```

적용 대상: 일일 한도 체크, 중복 생성 방지, 상태 기반 선점 처리.

### 중복 생성 방지 — P2002 캐치 패턴

unique 제약이 있는 테이블에서 `findUnique → create`는 레이스 위험. `create` + P2002 캐치만으로 단순화.
P2002/P2025 체크는 `apps/api/src/utils/prismaErrors.ts`의 헬퍼 함수를 사용한다 (`instanceof Prisma.PrismaClientKnownRequestError` 직접 사용 금지 — 테스트 환경에서 불안정):

```ts
import { isPrismaUniqueError, isPrismaNotFoundError } from '../utils/prismaErrors.js';

// ❌ 위험 — findUnique → create 사이에 다른 요청이 끼어들 수 있음
const existing = await prisma.sponsor.findUnique({ where: { orderId } });
if (existing) throw new ApiError(400, ERROR_CODES.ALREADY_VERIFIED);
await prisma.sponsor.create({ data: { ... } });

// ✅ 안전 — create 시도 후 P2002(unique 위반)로 중복 처리
try {
  await prisma.sponsor.create({ data: { ... } });
} catch (err) {
  if (isPrismaUniqueError(err)) {
    throw new ApiError(400, ERROR_CODES.ALREADY_VERIFIED);
  }
  throw err;
}

// ✅ P2025(레코드 없음) 체크
try {
  await prisma.report.update({ where: { id }, data: { ... } });
} catch (err) {
  if (isPrismaNotFoundError(err)) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
  throw err;
}
```

### 멱등성 보장 — upsert 패턴

BullMQ job 재시도 시 중복 레코드 생성을 방지:

```ts
// ✅ 최초 게시 + 재게시 모두 upsert로 멱등성 보장
await prisma.promotion.upsert({
  where: { reportId_platform: { reportId, platform } },
  create: { reportId, platform, ...data },
  update: data,
});
```

### 상태 선점 패턴 — updateMany 먼저 실행

외부 API 호출 전에 DB 상태를 먼저 변경하여 중복 처리 방지:

```ts
// ❌ 위험 — findMany → 외부 API → updateMany (중복 job이 같은 레코드 처리)
const items = await prisma.promotion.findMany({ where: { status: 'POSTED' } });
await deleteFromAllPlatforms(items);
await prisma.promotion.updateMany({ where: { id: { in: ids } }, data: { status: 'DELETED' } });

// ✅ 안전 — updateMany로 선점 후 외부 API 호출
const { count } = await prisma.promotion.updateMany({
  where: { reportId, status: 'POSTED' },
  data: { status: 'DELETED' },
});
if (count > 0) {
  const items = await prisma.promotion.findMany({ where: { reportId, status: 'DELETED' } });
  await deleteFromAllPlatforms(items);
}
```

### BullMQ Job 중복 실행 방지 — jobId 패턴

동일 엔티티에 대한 job이 중복 등록되지 않도록 `jobId` 부여:

```ts
// ✅ 같은 reportId로 중복 job 방지
await outreachQueue.add('discover-contacts', { reportId }, {
  jobId: `discover-contacts-${reportId}`,
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
});
```

### Raw 쿼리 — SQL Injection 방지

`$queryRawUnsafe` 사용 금지. 반드시 `$queryRaw` tagged template 사용:

```ts
// ❌ 위험 — 문자열 보간 (SQL Injection 가능)
await prisma.$queryRawUnsafe(`SELECT * FROM ${tableName} WHERE id = ${id}`);

// ✅ 안전 — tagged template 파라미터 바인딩
await prisma.$queryRaw`SELECT * FROM report WHERE id = ${id}`;

// ⚠️ 테이블명/컬럼명은 파라미터 바인딩 불가 — whitelist guard 필수
const ALLOWED_TABLES = new Set(['report', 'sighting', 'match']);
if (!ALLOWED_TABLES.has(tableName)) throw new Error('Invalid table');
```

`Prisma.raw()` 도 파라미터 바인딩을 우회하므로 사용 금지:

```ts
// ❌ 위험 — Prisma.raw()로 바인딩 우회
`LIMIT ${Prisma.raw(String(limit))} OFFSET ${Prisma.raw(String(skip))}`

// ✅ 안전 — tagged template 파라미터
`LIMIT ${limit} OFFSET ${skip}`
```

### 날짜 범위 조건 — UTC 기준 통일

서버 로컬 타임존 의존 금지. `setHours(0,0,0,0)` 대신 UTC 자정을 명시적으로 계산:

```ts
// ❌ 위험 — 서버 로컬 타임존 기준 (VPS가 UTC이면 한국 기준 오전 9시에 초기화)
const today = new Date();
today.setHours(0, 0, 0, 0);

// ✅ UTC 기준 명시적 계산
function utcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

## BullMQ 큐 사용

큐는 `jobs/queues.ts`에서 import. job name은 kebab-case 동사-명사:

```ts
import { imageQueue, matchingQueue, promotionQueue, notificationQueue } from '../jobs/queues.js';

// 재시도 설정 필수
await imageQueue.add(
  'process-report-photos',
  { type: 'report', reportId: report.id },
  { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
);
```

Worker 생성은 `createWorker<T>(queueName, processor, options?)` 헬퍼 사용:
- **큐 이름은 반드시 `QUEUE_NAMES.*` 상수 사용** (문자열 리터럴 금지)
- 기본 concurrency: 2
- completed/failed 이벤트 자동 로깅

```ts
import { QUEUE_NAMES } from '@findthem/shared';

// ✅ 올바른 패턴
createWorker<MatchingJobData>(QUEUE_NAMES.MATCHING, processMatchingJob, { concurrency: 2 });

// ❌ 금지 — 문자열 리터럴 직접 사용
createWorker<MatchingJobData>('matching', processMatchingJob);
```

큐 이름 타입이 필요한 경우 shared 상수에서 파생:

```ts
type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
```

## AI 호출 패턴

직접 Anthropic/Gemini/OpenAI SDK 호출 금지. `ai/aiClient.ts` 추상화 레이어만 사용 (Anthropic/Gemini/OpenAI 자동 라우팅):

```ts
import { askAI, askAIWithImage, compareImages } from '../ai/aiClient.js';

// 텍스트 요청 — agentId로 에이전트별 프로바이더/모델 설정 적용
const result = await askAI(systemPrompt, userMessage, { maxTokens: 256, agentId: 'promotion' });

// 단일 이미지 분석
const result = await askAIWithImage(systemPrompt, base64, userMessage, { agentId: 'image-matching' });

// 두 이미지 비교
const result = await compareImages(systemPrompt, base64A, base64B, context, { maxTokens: 1024, agentId: 'image-matching' });
```

- **기본 프로바이더**: Gemini 2.5 Flash (비용 효율, 관리자 대시보드에서 변경 가능)
- `agentId` 파라미터: 에이전트별 프로바이더/모델 오버라이드 적용 (미지정 시 기본 프로바이더 사용)
- 매 호출 시 토큰 사용량이 `AiUsageLog`에 자동 기록됨 (`aiUsageTracker.ts`)
- 프로바이더/모델은 관리자 대시보드에서 런타임 변경 가능 (60초 캐시)
- **tool_use 에이전트** (sighting, crawl, admin)는 `getAnthropicModelName()` 사용 — Gemini 모델명 혼입 방지

**이미지 분석 시 Sharp 전처리 패턴**:
```ts
const [base64, meta] = await Promise.all([
  imageService.toBase64(photo.photoUrl),
  imageService.extractMetadata(photo.photoUrl).catch(() => undefined),
]);
const analysis = await analyzeImage(base64, subjectType, undefined, meta);
```

**JSON 파싱 fallback 필수** (AI 응답이 항상 순수 JSON이 아닐 수 있음):
```ts
const jsonMatch = result.match(/\{[\s\S]*\}/);
if (!jsonMatch) return defaultValue;  // throw 대신 기본값 반환
return JSON.parse(jsonMatch[0]);
```

AI 호출 실패 시 graceful fallback (원본 텍스트 반환 또는 기본값):
```ts
try {
  return await askAI(...);
} catch {
  return rawInput;  // 실패해도 원본 반환
}
```

## 에이전트 캐릭터 시스템 패턴

캐릭터성은 프롬프트 설명이 아니라 **성격 벡터 기반 의사결정**으로 구현한다.
같은 이벤트에서 누구는 분석 게시, 누구는 확산, 누구는 안내하게 만드는 선택 로직이 핵심.

### 에이전트 자동 게시 진입점

```ts
// 도메인 이벤트 발생 시 해당 에이전트 함수를 fire-and-forget으로 호출
void postClaude(report.name, confidence, report.lastSeenAddress, report.subjectType as SubjectType, report.id)
  .catch((err) => log.warn({ err }, 'Claude community post failed'));

void postHeimi(report.name, contact.name, channel, report.subjectType as SubjectType, report.id)
  .catch((err) => log.warn({ err }, 'Heimi community post failed'));

void postAli(report.name, report.subjectType as SubjectType, report.lastSeenAddress, report.id)
  .catch((err) => log.warn({ err }, 'Ali community post failed'));
```

**주의**: Prisma enum → `@findthem/shared`의 `SubjectType` string literal union 변환 시 `as SubjectType` 캐스팅 필요.

### 에이전트 행동 선택 (내부 로직)

```ts
import { selectAction, generateCharacterPost } from '../ai/agentDecision.js';

const { selected: action, allCandidates } = selectAction(agentId, event);

if (action.type === 'stay_silent') return; // 이번엔 게시 안 함

const content = await generateCharacterPost(agentId, event, action) ?? fallbackContent;
```

### AgentConfig 구조 (agentPersonality.ts)

성격/정책/말투를 수정하려면 `apps/api/src/ai/agentPersonality.ts`의 AGENT_CONFIGS 수정:

```ts
const CLAUDE_CONFIG: AgentConfig = {
  id: 'image-matching',
  personality: { caution: 0.92, evidenceBias: 0.97, curiosity: 0.95, ... },
  policy: {
    mustDo: ['매칭 신뢰도 수치를 반드시 언급'],
    neverDo: ['신뢰도 수치 없이 단정'],
    forbiddenPhrases: ['확실합니다', '100%'],
    requiredElements: ['신뢰도 수치', '단서 또는 분석 언급'],
  },
  speech: { avgSentenceLength: 'medium', questionRate: 0.4, emojiRate: 0.3, ... },
};
```

### 의사결정 로그 (RL 데이터 기반)

모든 에이전트 결정은 `agent_decision_log` 테이블에 자동 기록:
- `candidateScores`: 모든 후보 행동의 점수 배열 (향후 contextual bandit 학습용)
- `stayedSilent`: `true`이면 해당 이벤트에서 게시 안 했음
- 직접 `AgentDecisionLog.create`를 호출하지 말고 `communityAgentService.ts`의 `runAgentPost` 내부에서 자동 처리됨

## Web3 결제 패턴

### 프론트엔드 (wagmi + Aptos)

지갑 연결과 트랜잭션 전송은 `SponsorPage.tsx`에서 wagmi hooks / Aptos adapter를 사용:

```tsx
// EVM — wagmi v2 hooks
const { sendTransactionAsync } = useSendTransaction();     // 네이티브 (ETH/BNB)
const { writeContractAsync } = useWriteContract();          // ERC20 transfer
const { switchChainAsync } = useSwitchChain();              // 체인 전환

// Aptos — wallet-adapter-react v8
const { signAndSubmitTransaction } = useAptosWallet();
```

**비동기 버튼 더블클릭 방지 — `useRef` 동기 잠금 패턴** (결제·부스트 등 모든 중요 액션):

```tsx
// ✅ useRef 동기 잠금 — React 리렌더 틈새 이중 호출 방지
const isSubmittingRef = useRef(false);

const handleAction = async () => {
  if (isSubmittingRef.current) return;
  isSubmittingRef.current = true;
  try {
    await doSomething();
  } finally {
    isSubmittingRef.current = false;
  }
};

// ❌ useState만으로는 부족 — setState는 비동기라 렌더 전 중복 호출 가능
const [loading, setLoading] = useState(false);
if (loading) return;  // 짧은 시간 안에 두 번 호출되면 둘 다 통과
```

**결제 흐름 필수 체크 사항:**
1. 더블클릭 방지: `useRef` 기반 동기 잠금 (`isPayingRef`)
2. 체인 전환: `switchChainAsync` 후 실제 체인 확인
3. Quote 만료 확인: signing 전 `quoteExpiresAt` 체크 필수
4. merchantWallet 검증: EVM `0x[40hex]`, Aptos `0x[1-64hex]` 정규식 검증
5. 거부 감지: `isUserRejection()` 헬퍼로 대소문자·에러코드(`4001`) 통합 처리
6. Aptos 응답 분기: `{ hash }` 성공 / `{ status: 'Rejected' }` 거부 / 기타 에러

### 백엔드 (온체인 검증)

온체인 검증은 `@findthem/web3-payment` 패키지 사용:

```ts
import { verifyEvmTransfer, verifyAptosTransfer, verifySolanaTransfer } from '@findthem/web3-payment';

// EVM — viem으로 TX receipt 확인 + Transfer 이벤트 디코딩
const result = await verifyEvmTransfer({ txHash, chainId, expectedFrom, expectedTo, tokenContract, minAmountAtomic });

// Aptos — REST API로 TX payload 검증
const result = await verifyAptosTransfer({ txHash, expectedFrom, expectedTo, coinType, minAmountAtomic, rpcUrl });

// 결과: { verified: boolean, actualAmount: bigint, pending?: boolean }
```

**검증 흐름 규칙:**
- 원자적 선점: `verifiedAt`이 null인 quote만 검증 진행 (동시 요청 방지)
- TX pending 시 408 반환 → 프론트에서 재시도 (최대 5회, 선형 backoff)
- TX 해시 중복 체크: 같은 TX로 여러 quote 검증 방지

### Web3Provider 구성

`main.tsx`에서 전체 앱을 `Web3Provider`로 감싸며, 내부 구성:

```
WagmiProvider → QueryClientProvider → RainbowKitProvider → AptosProvider → App
```

- `wagmi.ts`: `getDefaultConfig` + 환경변수 RPC URL 지원 (`VITE_ETH_RPC_URL` 등)
- `AptosProvider.tsx`: `autoConnect={false}`, `onError` 핸들러 설정
- Aptos SDK (~5MB)는 별도 chunk로 분리 (`vite.config.ts` manualChunks)

## 사진 업로드 + EXIF 역지오코딩 패턴

사진 업로드 시 EXIF GPS 좌표를 추출하고 Kakao Maps SDK로 주소를 자동 변환:

### PhotoUpload 컴포넌트

```tsx
// ✅ createObjectURL 사용 (즉시 생성, 메모리 절약)
const url = URL.createObjectURL(file);
URL.revokeObjectURL(url); // 삭제 시 반드시 해제

// ❌ readAsDataURL 금지 (파일 전체를 base64로 읽음)
```

**이미지 압축**: `apps/web/src/utils/compressImage.ts`의 `compressImage(file)` 함수 사용.
Canvas API 기반으로 긴 변 1200px 리사이즈 + EXIF Orientation 보정 + JPEG 80% 재인코딩.
`PhotoUpload.tsx`에서 import하여 사용하며, 직접 Canvas 압축 로직을 컴포넌트 안에 구현 금지.

**EXIF 파싱 통합**: 파일당 `exifr.parse()` 1회로 `onExifExtracted` + `onEachExif` 모두 처리.

```tsx
<PhotoUpload
  onChange={handlePhotosChange}          // useCallback 필수
  onExifExtracted={handleExifExtracted}  // 첫 사진: GPS 좌표 + 촬영 시간
  onEachExif={handleEachExif}            // 모든 사진: GPS → reverseGeocode → 주소 옵션
/>
```

### reverseGeocode (Kakao Maps SDK)

```ts
import { reverseGeocode } from '../hooks/useKakaoMap';
const address = await reverseGeocode(lat, lng);
// → 도로명 주소 우선, 없으면 지번. 실패 시 null. 10초 타임아웃.
```

### 다중 주소 선택

- 1개 주소: 자동 채우기 + 텍스트 input
- 2개+ 주소: select 드롭다운 + "직접 입력" 옵션
- 반복 계산(`addressOptions.some()`)은 렌더 전 변수로 1회 계산

## 프론트엔드 에러 처리 패턴

API 에러는 `t(\`errors.\${code}\`)` 패턴으로 번역하여 표시. `err.message`를 직접 노출 금지:

```tsx
// ✅ 올바른 패턴
} catch (err: unknown) {
  const code = err instanceof Error ? err.message : '';
  setError(t(`errors.${code}`, { defaultValue: t('page.errorFallback') }));
}

// ❌ 금지 — 에러 코드가 사용자에게 raw 노출
setError(err instanceof Error ? err.message : '에러 발생');
```

- `api/client.ts`의 `Error.message`에는 `ERROR_CODES` 문자열이 담김
- 번역 키가 없는 경우 `defaultValue`로 폴백
- 한국어/영어 하드코딩 폴백 금지 → `t('page.errorFallback')` 사용
- 관리자 페이지도 동일 규칙 적용

## 목록 페이지 패턴 (BrowsePage)

신고와 제보를 하나의 목록에서 필터로 전환:

```
[전체] [신고] [제보]                             ← 보기 필터 (ViewMode)
종류 [전체][강아지][고양이]  상태 [전체][찾는중]...  ← 신고 모드에서만 표시
지역 [전체][서울][경기]...                        ← 항상 표시
🔍 검색...                                       ← debounce 300ms
```

- **전체**: 신고 + 제보를 `createdAt` 기준 합쳐서 카드 그리드
- **신고**: ReportCard (종류/상태/지역 필터 포함)
- **제보**: SightingCard (종류/상태 필터 숨김)
- API: 전체 모드는 `GET /reports` + `GET /sightings` 병렬 호출
- AbortController로 이전 요청 취소, 검색 debounce 300ms
- `REPORT_PHASE_VALUES` (`@findthem/shared`): searching, sighting_received, analysis_done, found

### 내 활동 페이지 (MyReportsPage)

`/my-reports` — 내 신고 + 내 제보를 필터로 전환 (전체/신고/제보).
`GET /reports/mine` + `GET /sightings/mine` 병렬 호출 → `createdAt` 기준 합쳐서 표시.

## Pixi.js + Spine 패턴

홈페이지 히어로 씬에서 Pixi.js v8 + Spine 스켈레톤 애니메이션 사용:

```tsx
// PixiHeroScene.tsx — 필수 패턴
import { Application, Graphics, Text, TextStyle, Container, extensions } from 'pixi.js';
import { SpinePipe } from '@esotericsoftware/spine-pixi-v8';

// ✅ SpinePipe 명시적 등록 (Vite tree-shaking 방지)
extensions.add(SpinePipe);

// ✅ autoStart: false → Spine 로드 전 ticker 에러 방지
await app.init({ canvas, width, height, background: 0xeef2ff, autoStart: false });

// ✅ Spine 로드 완료 후 ticker 시작
app.ticker.start();
```

**금지 패턴**:
```ts
// ❌ Graphics에 수백 개 도형 그리기 → validateRenderable 에러
for (let i = 0; i < 1000; i++) bg.circle(x, y, r).fill(color);

// ❌ side-effect import만으로 SpinePipe 등록 기대 (tree-shaking됨)
import '@esotericsoftware/spine-pixi-v8';

// ❌ autoStart 기본값(true) 사용 → Spine 로드 전 렌더 에러
await app.init({ canvas, width, height });
```

**SpineCharacterLite** (`src/game/SpineCharacterLite.ts`):
- `create(skinNames: readonly string[])`: body/cos/hat/weapon 스킨 조합 가능 — `as const` 배열 직접 전달 가능
- `tick(dt)`: 매 프레임 호출 (autoUpdate: false)
- `playExpression(name)`: Track 1에서 표정 재생
- `dispose()`: 인스턴스 정리 (공유 캐시는 `resetCache()` 별도 호출)

## shared 패키지

`packages/shared/src/`의 세 파일:
- `types.ts` — 타입/인터페이스 (Prisma enum과 1:1 매핑), `SupportedPayToken` (constants에서 파생)
- `constants.ts` — 상수 (임계값, 큐 이름, 챗봇 메시지, 업로드 제한, Zod enum 배열)
- `utils.ts` — 유틸 함수 (parseSubjectType, parseTimeExpression, buildSightingSummary, formatTimeAgo)

주요 Zod enum 배열 상수 (SSOT):
- `SUBJECT_TYPE_VALUES`, `GENDER_VALUES`, `REPORT_STATUS_VALUES`, `MATCH_STATUS_VALUES`
- `REPORT_PHASE_VALUES` — 목록 필터용 (searching, sighting_received, analysis_done, found)
- `SUPPORTED_PAY_TOKENS` — 결제 토큰 (APT, USDC, USDt, ETH, BNB, SOL)

`index.ts`에서 3개 파일 모두 re-export. 새 항목 추가 시 해당 파일에 직접 작성 (index.ts 수정 불필요).

## 테스트

- 테스트 파일은 소스 파일 옆에: `foo.ts` → `foo.test.ts`
- E2E 테스트는 `apps/api/tests/e2e/`
- 프레임워크: Vitest + Supertest (API 테스트)
- 기존 테스트 파일: `middlewares/validate.test.ts`, `middlewares/auth.test.ts`, `middlewares/errors.test.ts`, `services/storageService.test.ts`

## 다국어 (i18n)

4개 언어 지원: `ko`, `en`, `ja`, `zh-TW`. 상세: [docs/i18n.md](../../docs/i18n.md)

### 프론트엔드 규칙

- **한국어 하드코딩 금지**: 모든 UI 텍스트는 `t('key')` 사용
- 번역 파일: `apps/web/src/locales/{locale}/translation.json`
- 새 문자열 추가 시 4개 언어 파일 모두 업데이트

```tsx
// ✅ 올바른 패턴
const { t } = useTranslation();
<h1>{t('home.heroTitle')}</h1>
<p>{t('detail.sightingCount', { count: 5 })}</p>

// ❌ 금지 패턴
<h1>잃어버린 소중한 가족을 찾아드립니다</h1>
```

### 백엔드 규칙

- **에러 메시지**: 한국어 대신 `ERROR_CODES` 상수 사용 → 프론트에서 번역
- **다국어 함수**: `locale` 파라미터 필수 (기본값 `'ko'`)

```ts
// ✅ 에러 코드 사용
throw new ApiError(404, 'REPORT_NOT_FOUND');

// ❌ 한국어 직접 사용 금지
throw new ApiError(404, '신고를 찾을 수 없습니다.');

// ✅ 다국어 함수 호출
formatTimeAgo(date, locale);
parseSubjectType(msg, locale);
buildSightingSummary(context, locale);
```

## Capacitor 네이티브 패턴

### 라우트 관리

웹(App.tsx)과 네이티브(NativeApp.tsx)의 라우트 중복을 방지하기 위해 `routes/userRoutes.tsx`에서 중앙 정의:

```tsx
// ✅ 공통 라우트 — 추가 시 이 파일만 수정
import { userRoutes } from './routes/userRoutes';
userRoutes({ user, login, register, updateUser }).map(({ path, element }) => (
  <Route key={path} path={path} element={element} />
))

// ❌ App.tsx와 NativeApp.tsx에 같은 라우트를 각각 정의
```

### 동적 import 필수

Capacitor 플러그인은 반드시 동적 import 사용 (웹 빌드에서 네이티브 코드가 번들되지 않도록):

```ts
// ✅ 동적 import
const { AdMob } = await import('@capacitor-community/admob');

// ❌ 정적 import (웹 빌드 실패)
import { AdMob } from '@capacitor-community/admob';
```

### 네이티브/웹 분기

```ts
// ✅ 패키지에서 Capacitor re-export 사용
import { Capacitor } from '@findthem/capacitor-native';
if (Capacitor.isNativePlatform()) { ... }

// ✅ 네이티브 전용 컴포넌트는 조건부 렌더링
{!Capacitor.isNativePlatform() && <BottomTab />}
```

### OTA 업데이트

```ts
// ✅ 렌더링 완료 후 호출 (main.tsx bootstrap 함수 끝)
void notifyOtaReady();

// ❌ initCapacitorPlugins 내부에서 호출 (렌더링 전이라 롤백 판단 부정확)
```
