# 아키텍처 규칙

## 모노레포 구조

```
findthem/
├── apps/api/                 # Express.js 백엔드 (포트 4000)
├── apps/web/                 # React 19 + Vite 프론트엔드 (포트 5173)
├── packages/shared/          # @findthem/shared — 공유 타입/상수/유틸
├── packages/web3-payment/    # @findthem/web3-payment — 온체인 검증 (viem)
├── packages/capacitor-native/ # @findthem/capacitor-native — 네이티브 플러그인/네비게이션/OTA
├── docker-compose.yml        # PostgreSQL:5433, Redis:6380
└── CLAUDE.md
```

## 레이어 규칙

- **공유 타입**: 반드시 `packages/shared/src/`에 정의하고 `@findthem/shared`로 임포트
- **환경 변수**: `apps/api/src/config.ts`의 `config` 객체로만 접근 (process.env 직접 사용 금지)
- **DB 접근**: `apps/api/src/db/client.ts`의 `prisma` 싱글턴만 사용
- **AI 호출**: `apps/api/src/ai/aiClient.ts` 래퍼를 통해서만 호출 (프로바이더 자동 라우팅)
- **큐 사용**: `apps/api/src/jobs/queues.ts`에서 정의한 큐만 사용
- **온체인 검증**: `packages/web3-payment`의 `verifyEvmTransfer` / `verifyAptosTransfer` 사용
- **Web3 프론트**: wagmi + RainbowKit (EVM), @aptos-labs/wallet-adapter-react (Aptos)

## Pixi.js + Spine 히어로 씬

홈페이지 히어로 섹션은 SVG 일러스트 + StatsStrip 컴포넌트로 구성됨 (PixiHeroScene 제거됨).
Pixi.js + Spine 씬은 현재 AI 탐정 페이지(TeamPage)의 AgentActivityScene에서만 사용:

```
packages/pixi-scenes/src/game/
├── assetUrl.ts              # Capacitor 호환 에셋 URL 유틸 (IS_NATIVE 판별)
├── SpineCharacterLite.ts    # Spine 캐릭터 래퍼 (웹: WebP, 네이티브: PNG)
├── FolkCharacter.ts         # 32px ai-town 스프라이트 캐릭터
├── PixelCharacter.ts        # 16×32 LimeZu 스프라이트 캐릭터
├── AgentRoom.ts             # 오피스 스타일 Graphics 폴백 렌더러
├── TileMapRoom.ts           # gentle-obj 타일맵 렌더러
└── TiledMapRenderer.ts      # Tiled JSON 멀티타일셋 렌더러

apps/web/
├── public/spine/
│   ├── human_type.skel.bytes        # 스켈레톤 바이너리
│   ├── human_type.atlas.txt         # 텍스처 아틀라스 (페이지명 .webp)
│   ├── human_type*.webp (3개)       # 웹용 텍스처 (WebP)
│   └── human_type*.png (3개)        # 네이티브용 텍스처 (PNG)
└── src/components/
    ├── AgentActivityScene.tsx       # 에이전트 활동 씬 (TeamPage, 탑다운) ← 현재 사용 중
    └── AgentActivityOverlay.tsx     # 에이전트 통계 HTML 오버레이
```

**에셋 URL 호환 (`assetUrl.ts`)**:
- Capacitor WebView(`capacitor://localhost`)에서 `/path`가 `capacitor://path`로 잘못 해석됨
- `assetUrl(path)` — `window.location.origin`을 포함한 절대 URL 반환
- 모든 Pixi 에셋 로딩(`Assets.load`, `fetch`)에서 반드시 `assetUrl()` 사용
- `IS_NATIVE` — `capacitor:` 또는 `ionic:` 프로토콜 감지

**Spine 텍스처 네이티브/웹 분기**:
- **웹**: WebP 텍스처 + blob → dataURL → Assets.load (MIME 타입 감지)
- **네이티브**: PNG 텍스처 + 직접 URL 로딩 (iOS 이미지 디코더 WebP 호환 문제 방지)
- atlas.txt는 WebP 페이지명 기준, 네이티브에서 런타임에 `.webp` → `.png` 치환

**주의사항**:
- pixi.js `8.15.0` + @esotericsoftware/spine-pixi-v8 `4.2.98` (pryzm과 동일 버전 필수)
- `SpinePipe`는 반드시 명시적으로 등록: `extensions.add(SpinePipe)` (Vite tree-shaking 방지)
- Pixi `Application.init()`에 `autoStart: false` 필수 (Spine 로드 전 ticker 에러 방지)
- Graphics에 수백 개의 `.circle().fill()` 호출하면 `validateRenderable` 에러 발생 → 도트 패턴은 CSS로 처리
- `Graphics.fill()`에 알파 포함 단일 숫자(`0xFFFFFFDD`) 금지 → `{ color: 0xffffff, alpha: 0.87 }` 객체 형태 사용 (Pixi v8 Color._normalize 범위 초과 에러)

## 에이전트 활동 씬 (Agent Activity Scene)

커뮤니티 페이지에서 3종 AI 에이전트가 일하는 모습을 게임처럼 보여주는 탑다운 씬.
Stanford Generative Agents 마을 타일맵 (the_ville) + FolkCharacter (32px) 결합:

```
AgentActivityScene (React Component)
├── Pixi Application (탑다운 뷰)
│   ├── roomLayer — TiledMapRenderer (Tiled JSON 멀티타일셋) / AgentRoom Graphics 폴백
│   ├── charLayer — FolkCharacter × 3 (32px)
│   ├── uiLayer — 말풍선 + 작업 아이콘 + 이름 태그
│   └── Ticker — 이벤트 큐 소비 + 큐 기반 퀘스트 + 유휴 패트롤
├── useAgentActivity (15초 폴링)
│   → GET /api/community/agent-activity?since=<ISO>
│   → pendingEventsRef → Pixi ticker에서 dequeue
└── AgentActivityOverlay (HTML) — 에이전트별 일일 통계
```

**타일맵 에셋** (generative_agents 기반):
- 맵: `public/tiles/the_ville/map.json` (140×100 타일, 32px, Tiled JSON)
- 타일셋: 18개 (CuteRPG + Room Builder + Interiors + Blocks)
- 경로: `public/tiles/the_ville/{v1,cute_rpg_word_VXAce/tilesets,blocks}/`
- 시각 레이어 10개 렌더링 (바닥, 벽, 가구, 전경 등)
- 카메라 드래그 지원 (마을 전체 탐색)

**에이전트 행동**: 유휴 시 마을 내 패트롤, `queuePending > 0`이면 작업 애니메이션, 이벤트 수신 시 작업 아이콘 + 말풍선
**네이티브 빌드**: 타일맵 에셋이 APK/IPA에 번들됨

## @findthem/capacitor-native 패키지

Capacitor 플러그인 초기화, 네이티브 네비게이션, OTA 업데이트를 관리하는 패키지:

```
packages/capacitor-native/src/
├── initPlugins.ts       # initNativePlugins() — StatusBar, SplashScreen, AdMob
│                        # notifyOtaReady() — OTA 업데이트 롤백 방지
├── bootstrapNative.tsx  # bootstrapNative() — 네이티브 탭 + NativeNavigationRouter
└── index.ts             # 패키지 진입점
```

**의존성**: `capacitor-native-navigation`, `@capgo/capacitor-updater`, `@capacitor/*`

## Capacitor 모바일 + AdMob

네이티브 앱(iOS/Android)에서만 동작하는 기능은 `Capacitor.isNativePlatform()` 체크 필수:

```ts
// apps/web/src/bootstrap/initCapacitorPlugins.ts
// @findthem/capacitor-native의 initNativePlugins() 호출 + Firebase 초기화
// 1. StatusBar, SplashScreen, AdMob (패키지에서)
// 2. FirebaseAnalytics, Crashlytics, FCM (앱 레벨)

// apps/web/src/hooks/useRewardAd.ts — 리워드 광고 훅
// showRewardAd(): Promise<boolean> — 리워드 지급 여부 반환 (네이티브 아닐 경우 즉시 false)
```

**리워드 광고 리스너 패턴** (`useRewardAd.ts`):

```ts
// ✅ 올바른 패턴 — 리스너 등록 완료 후 광고 로드 (타이밍 버그·메모리 누수 방지)
return await new Promise<boolean>((resolve) => {
  void (async () => {
    let settled = false;
    const rewardHandle  = await AdMob.addListener(RewardAdPluginEvents.Rewarded,  () => { if (!settled) { settled = true; cleanup(); resolve(true);  } });
    const dismissHandle = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => { if (!settled) { settled = true; cleanup(); resolve(false); } });
    const cleanup = () => { rewardHandle.remove(); dismissHandle.remove(); };
    try {
      await AdMob.prepareRewardVideoAd({ adId });
      await AdMob.showRewardVideoAd();
    } catch { if (!settled) { settled = true; cleanup(); resolve(false); } }
  })();
});

// ❌ 금지 패턴 — addListener() 반환값에 .then() 없이 .remove() 직접 호출 (TS 에러)
const handle = AdMob.addListener(...);  // Promise<PluginListenerHandle>
handle.remove();                         // ❌ Promise에 remove() 없음

// ❌ 금지 패턴 — 광고 로드 후 리스너 등록 (이벤트 유실 위험)
await AdMob.prepareRewardVideoAd({ adId });
const handle = await AdMob.addListener(...);  // 이미 발화된 이벤트 놓칠 수 있음
```

**주의**:
- `@capacitor-community/admob`은 동적 import (`await import(...)`) 필수 (웹 빌드 호환)
- `AdMob.addListener()`는 `Promise<PluginListenerHandle>` 반환 → 반드시 `await` 후 `.remove()` 호출
- 리스너 2개를 모두 `await`로 등록한 뒤 `prepareRewardVideoAd` 호출 (순서 역전 시 이벤트 유실)
- PWA precache에서 `public/spine/**` 제외 (`vite.config.ts` `globIgnores: ['spine/**']`) — 9MB 파일 크기 초과 방지

## 네이티브 네비게이션 (capacitor-native-navigation)

네이티브 앱에서 하단 탭 바와 스택 네비게이션을 OS 기본 UI로 렌더링:

```
apps/web/src/
├── main.tsx                    # Capacitor.isNativePlatform() 분기
│                               #   네이티브 → bootstrapNative() → NativeNavigationRouter
│                               #   웹 → BrowserRouter (기존)
├── NativeApp.tsx               # 네이티브 전용 라우트 (BottomTab/Footer 없음)
├── routes/userRoutes.tsx       # 공통 라우트 정의 (App.tsx + NativeApp.tsx 공유)
└── bootstrap/
    ├── initCapacitorPlugins.ts # @findthem/capacitor-native 래퍼 + Firebase
    └── bootstrapNative.tsx     # @findthem/capacitor-native bootstrapNative() 호출
```

**부트스트랩 흐름**:
```
main.tsx
  → initCapacitorPlugins() (StatusBar, SplashScreen, AdMob, Firebase)
  → Capacitor.isNativePlatform()?
    ├── true:  bootstrapNative(root) → NativeNavigation.present(tabs) → NativeNavigationRouter
    └── false: BrowserRouter → App.tsx (웹, 기존 방식)
  → notifyOtaReady() (OTA 롤백 방지)
```

**탭 구성**: 5개 (홈, 찾기, 신고, 커뮤니티, 프로필) — `packages/capacitor-native/src/bootstrapNative.tsx`에서 커스터마이징 가능

**라우트 공유 패턴**:
```ts
// routes/userRoutes.tsx — 웹과 네이티브 모두에서 사용
export function userRoutes(ctx: UserRoutesContext): RouteEntry[] { ... }

// App.tsx (웹) — Header/BottomTab/Footer + 공통 라우트 + 웹 전용 /dev/* 라우트
// NativeApp.tsx (네이티브) — 공통 라우트만 (네이티브 탭 바가 BottomTab 대체)
```

## 네이티브 빌드 모드

`BUILD_TARGET=native` 환경변수로 웹/네이티브 빌드 분기:

| 항목 | 웹 (`npm run build`) | 네이티브 (`npm run build:native`) |
|------|---------------------|----------------------------------|
| server.url | `https://union.pryzm.gg` (원격) | 제거 (로컬 dist/ 번들) |
| PWA | VitePWA 포함 | 제외 (Capacitor가 대체) |
| Spine 에셋 | 네트워크 fetch | APK에 번들 |
| API Base URL | `/api` (프록시) | `VITE_API_BASE_URL` (.env.native) |
| Vite mode | `production` | `native` |

```bash
# 원커맨드 네이티브 빌드 (shared → web3 → web → cap sync)
npm run build:native
```

**Android 릴리스 서명 (keystore.properties)**:
- `apps/web/android/keystore.properties` — gitignore 대상, CI/CD에서 주입
- `build.gradle`이 이 파일을 읽어 signingConfigs에 적용
- Jenkins/CI에서 `BUILD_TARGET=native`와 함께 keystore.properties를 파일로 생성 후 빌드

**iOS 릴리스**:
- `apps/web/ios/App/Podfile` — Firebase 의존성 포함 (`pod install` 필요)
- `capacitor.config.ts` — `appId`, `appName` 기준으로 Xcode 프로젝트 구성

## iOS 빌드 주의사항

### `cap sync` 후 Podfile 확인 필수

`npx cap sync ios` 실행 시 Capacitor가 Podfile의 pod 목록을 재생성한다.
`CapacitorFirebaseAnalytics/Analytics` subspec이 `CapacitorFirebaseAnalytics`로 바뀌면
Firebase 모듈 의존성이 누락되어 빌드 실패함.

**대응**: `@capacitor-firebase/analytics`를 `capacitor.config.ts`의 `includePlugins`에서 제외하고,
Podfile의 `target 'App'` 블록에 직접 고정:

```ruby
target 'App' do
  capacitor_pods
  pod 'CapacitorFirebaseAnalytics/Analytics', :path => '...'
end
```

### GoogleService-Info.plist 등록 필수

Firebase 플러그인 사용 시 `GoogleService-Info.plist`가 Xcode 프로젝트의 **빌드 리소스**에
포함되어야 한다. 파일이 `App/App/` 디렉토리에 존재하더라도 `project.pbxproj`에 등록되지 않으면
`FirebaseApp.configure()` 시 크래시 발생.

- PBXFileReference + PBXBuildFile + PBXResourcesBuildPhase 3곳에 등록 필요
- Xcode에서 파일을 드래그&드롭으로 추가하면 자동 등록됨

### AppDelegate에서 Firebase 초기화

```swift
import FirebaseCore

func application(...) -> Bool {
    FirebaseApp.configure()  // 반드시 첫 줄에 호출
    return true
}
```

미호출 시 시뮬레이터에서는 동작하지만 **실기기에서 크래시** 발생 (AdMob/Crashlytics/Messaging이 Firebase 초기화 전에 접근).

### Capacitor WebView 에셋 경로

`capacitor://localhost` 스킴에서 Pixi.js `Assets.load('/path')`가 `capacitor://path`로
잘못 해석됨 (localhost 누락). 모든 에셋 URL에 `assetUrl()` 유틸 사용 필수:

```ts
import { assetUrl } from './assetUrl';
Assets.load(assetUrl('/tiles/sprite.png')); // capacitor://localhost/tiles/sprite.png
```

### Spine 텍스처 WebP 비호환

iOS WKWebView에서 WebP 이미지를 blob → dataURL로 변환 후 Pixi에 전달하면
`makeImagePlus: ERROR 'WEBP' failed` 에러 발생. 네이티브에서는 PNG 사용:

- `public/spine/` 디렉토리에 WebP + PNG 모두 보관
- `IS_NATIVE` 플래그로 런타임 분기 (SpineCharacterLite.ts)
- atlas.txt는 WebP 기준, 네이티브에서 `.webp` → `.png` 런타임 치환

### IPHONEOS_DEPLOYMENT_TARGET 일치

`project.pbxproj`의 `IPHONEOS_DEPLOYMENT_TARGET`과 `Podfile`의 `platform :ios`가
불일치하면 "built for newer iOS-simulator version" 경고 대량 발생.
현재 설정: **iOS 16.0** (Podfile + project.pbxproj 모두)

## Universal Link (iOS OAuth 콜백)

네이티브 앱에서 OAuth 로그인(카카오/네이버/애플/텔레그램) 후 외부 브라우저에서 앱으로 자동 복귀하기 위해 Universal Link 사용.

**동작 흐름**:
```
앱에서 OAuth 시작 → 외부 브라우저/SFSafariViewController 열림
  → 카카오/네이버 인증 → 백엔드 콜백 → redirectWithToken()
  → https://union.pryzm.gg/auth/callback#token=...
  → iOS가 Universal Link 인터셉트 → 앱으로 복귀
  → bootstrapNative의 appUrlOpen 리스너 → AuthCallbackPage 라우팅
```

**구성 요소**:

| 파일 | 역할 |
|------|------|
| `apps/web/public/.well-known/apple-app-site-association` | AASA 파일 — `/auth/callback` 경로를 앱으로 연결 |
| `apps/web/ios/App/App/App.entitlements` | Associated Domains: `applinks:union.pryzm.gg` |
| `deploy/union.pryzm.gg.conf` | Nginx에서 `.well-known` 경로를 JSON으로 서빙 |
| `packages/capacitor-native/src/bootstrapNative.tsx` | `@capacitor/app`의 `appUrlOpen` 이벤트 수신 → 라우터 전달 |

**배포 체크리스트**:
1. Apple Developer Console → App ID (`gg.pryzm.union`) → Associated Domains capability 활성화
2. 서버에 AASA 파일 배포 (`/var/www/union/.well-known/apple-app-site-association`)
3. Nginx 설정 반영 + reload
4. 검증: `curl https://union.pryzm.gg/.well-known/apple-app-site-association`
5. Apple CDN 캐싱 최대 24시간 딜레이 가능 — 개발 중에는 entitlements에 `?mode=developer` 추가로 우회

## OTA 업데이트 (@capgo/capacitor-updater)

로컬 번들 모드에서 앱스토어 재배포 없이 웹 번들 업데이트:

- `CapacitorUpdater.autoUpdate: true` — 자동 업데이트 체크
- `notifyOtaReady()` — 렌더링 완료 후 호출, 현재 번들 승인 (미호출 시 자동 롤백)
- Capgo 클라우드 또는 self-hosted 서버 사용 가능

## 관리자 대시보드 (Admin)

`apps/web/src/pages/admin/` — 12개 관리 페이지, 모바일 반응형 지원.

**레이아웃 (`AdminLayout.tsx`)**:
- 데스크톱(`lg` 이상): 좌측 고정 사이드바 (`w-56`) + 콘텐츠 영역
- 모바일(`lg` 미만): 햄버거 메뉴 → 사이드바 drawer (오버레이 + slide-in)
- 모바일 헤더에 현재 페이지 아이콘 + 타이틀 표시
- `h-dvh` 사용 (iOS Safari 주소창 대응)

**페이지 공통 패턴**:
- 컨테이너: `p-4 lg:p-6`
- 페이지 제목: `text-lg lg:text-xl`
- 헤더 레이아웃: `flex flex-wrap gap-2 items-center justify-between`
- 테이블: `bg-white rounded-lg shadow overflow-hidden > overflow-x-auto > table(min-w-[600px])`
- 탭 바: `overflow-x-auto scrollbar-hide`

**특수 페이지**:
- `AgentChatPage`: 세션 목록 — 데스크톱 사이드바 + 모바일 drawer (별도)
- `DevlogPage`: 헤더 + 탭이 고정, 콘텐츠 스크롤

## Q&A 크롤 + 외부 에이전트 Webhook

외부 Q&A 사이트에서 질문을 크롤해 커뮤니티에 등록하고, 내부/외부 에이전트가 답변:

```
qaCrawlQueue (cron: 0 */4 * * *)
  → QaFetcher.fetch() (네이버 지식인 등)
  → CommunityPost 생성 (sourceUrl + deduplicationKey)
  → answerQuestionWithAgents() — 내부 에이전트 AI 답변 (병렬)
  → dispatchWebhookToAll() — 외부 에이전트 HTTPS webhook 알림
```

```
apps/api/src/
├── jobs/
│   ├── qaCrawlJob.ts              # BullMQ Worker + cron
│   └── crawl/qa/
│       ├── types.ts               # QaFetcher 인터페이스
│       ├── qaFetcherRegistry.ts   # 소스 레지스트리
│       └── fetchers/naverKin.ts   # 네이버 지식인
└── services/
    ├── webhookDispatcher.ts       # SSRF 방어 + HMAC 서명 + 발송
    └── qaAgentAnswerService.ts    # 내부 에이전트 자동 답변
```

**Webhook 보안**: HTTPS 필수, DNS resolve 후 사설IP 차단, HMAC-SHA256 서명, payload 500자 truncate

## AI 프로바이더 기본값

- **기본 프로바이더**: Gemini (`gemini-2.5-flash`) — 비용 효율적 (이미지 분석 ~$0.0005/장)
- **tool_use 에이전트** (sighting, crawl, admin): Anthropic SDK 직접 호출 → `getAnthropicModelName()` 사용
- **일반 AI 호출** (askAI, askAIWithImage, compareImages): `getProviderName()` → 동적 라우팅

```ts
// 일반 AI — Gemini 기본 (관리자 대시보드에서 변경 가능)
const result = await askAI(prompt, msg, { agentId: 'image-matching' });

// tool_use 에이전트 — 반드시 Anthropic 전용 함수 사용
const model = await getAnthropicModelName('sighting');
const claude = await getClaudeClient();
```

## 이미지 분석 파이프라인 (Sharp 하이브리드)

이미지 분석은 Sharp 전처리 + LLM 1회 호출로 구성:

```
사진 업로드
  → Sharp 전처리 (무료, ~50ms)
    - 주요 색상 3~5개 (RGB hex)
    - 블러 점수 (0~1)
    - 이미지 해시 (중복 감지용)
    - 해상도
  → LLM 1회 호출 (Gemini 2.5 Flash, ~$0.0005)
    - Sharp 메타데이터를 프롬프트에 첨부
    - 품종, 목줄 유무, 건강상태, 털 상태 추출
    - JSON 구조화 응답
```

핵심 함수:
- `imageService.extractMetadata(path)` → `ImageMetadata` (Sharp)
- `analyzeImage(base64, subjectType, locale, meta)` → JSON (LLM)

## 비동기 처리

무거운 작업(AI 이미지 분석, SNS 게시, 알림)은 반드시 BullMQ 큐로 처리:
- `imageQueue` → Sharp 전처리 + AI 사진 분석 + 커뮤니티 자동 게시
- `matchingQueue` → 매칭 실행
- `promotionQueue` → SNS 게시 / 광고 부스트
- `notificationQueue` → 알림 발송
- `qaCrawlQueue` → Q&A 크롤 + 에이전트 답변 + webhook 알림
