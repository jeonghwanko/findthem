# FindThem — AI 작업 가이드

## 프로젝트 개요

실종된 사람/반려동물을 찾는 AI 기반 플랫폼.
신고 등록 → 목격 제보 → Claude AI 이미지 매칭 → 신고자 알림 + SNS 자동 게시.

## 모노레포 구조

```
findthem/
├── apps/api/                 # Express.js 백엔드 (포트 4000)
├── apps/web/                 # React 19 + Vite (포트 5173)
├── packages/shared/          # @findthem/shared (공유 타입/상수/유틸)
├── packages/web3-payment/    # @findthem/web3-payment (온체인 TX 검증)
├── packages/capacitor-native/ # @findthem/capacitor-native (네이티브 플러그인/네비게이션/OTA)
├── docker-compose.yml        # PostgreSQL:5433, Redis:6380
└── docs/                     # 상세 문서
```

## 기술 스택 요약

- **백엔드**: Node.js 20, Express.js, TypeScript 5.7, Prisma + PostgreSQL, BullMQ + Redis
- **프론트엔드**: React 19, React Router v7, Vite, Tailwind CSS, Pixi.js v8 + Spine
- **모바일**: PWA (vite-plugin-pwa + Workbox) + Capacitor 7 (iOS/Android), 네이티브 네비게이션 (capacitor-native-navigation), OTA 업데이트 (@capgo/capacitor-updater)
- **AI**: 멀티 AI: Anthropic Claude, Google Gemini, OpenAI GPT (런타임 전환)
- **Web3**: wagmi v2 + RainbowKit v2 + viem (EVM), @aptos-labs/wallet-adapter-react v8 (Aptos)
- **연동**: KakaoTalk Channel, Twitter API v2, Kakao Map API, Toss Payments

## 개발 명령어

```bash
docker compose up -d          # DB + Redis 실행
npm run dev:api               # API 개발 서버
npm run dev:web               # Web 개발 서버
npm run test                  # 전체 테스트
npm run lint                  # ESLint 전체 검사
npm run lint:fix              # ESLint 자동 수정
npx prisma migrate dev        # DB 마이그레이션

# 모바일 (Capacitor)
npm run build:native          # 네이티브 빌드 (Vite native 모드 + cap sync 통합)
npm run build -w apps/web     # 웹앱 빌드 (dist/ 생성, 원격 서버 모드)
npx cap run android           # Android 에뮬레이터 실행
npx cap run ios               # iOS 시뮬레이터 실행 (Mac 필요)
npx cap open android          # Android Studio 열기
npx cap open ios              # Xcode 열기 (Mac 필요)

# Android 릴리스 빌드 (JAVA_HOME 필수 — Android Studio JBR 21 사용)
# ⚠️ 반드시 npm run build:native 실행 후 진행
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
cd apps/web/android
./gradlew bundleRelease       # AAB → app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease     # APK → app/build/outputs/apk/release/app-release.apk
```

## 핵심 규칙 (5가지)

1. **공유 타입**은 `packages/shared/src/`에 정의, `@findthem/shared`로 임포트
2. **환경 변수**는 `apps/api/src/config.ts`의 `config` 객체로만 접근
3. **무거운 작업**(AI 분석, SNS 게시, 알림)은 반드시 BullMQ 큐로 비동기 처리
4. **UI 문자열**은 하드코딩 금지 → 프론트엔드: `t('key')` (react-i18next), 백엔드: 에러 코드 상수 사용
5. **로깅**은 `console.*` 금지 → `createLogger('module')` (pino) 사용, ESLint `no-console: error` 적용

## 프로덕션 환경

- **서버**: VPS Ubuntu, 패키지 직접 설치 (Docker 미사용)
- **도메인**: `union.pryzm.gg` — 앞단 SSL 처리 후 포트 3000으로 인입
- **Nginx**: 포트 3000 리슨, `deploy/nginx.conf` 기준으로 운영
  - `/api/` → Express 4000
  - `/devlog` → Ghost CMS 2368
  - `/uploads/` → 정적 파일
  - `/` → React SPA (`/var/www/union/`)
- **프로세스 관리**: PM2
  - `findthem-api` — Express 백엔드
  - `ghost` — Ghost CMS (`/var/www/ghost`)
- **DB**: PostgreSQL + Redis (패키지 직접 설치)

## 배포 Flow

```
git push origin master
      ↓
GitHub Actions (.github/workflows/ci.yml)
  1. CI: 타입체크 → 테스트 → 빌드
  2. CD: SSH로 VPS 접속
      - git pull
      - npm ci + prisma generate + build
      - prisma migrate deploy
      - 웹 dist → /var/www/union/ 복사
      - pm2 restart findthem-api  (ecosystem.config.cjs 기준)
      - nginx.conf 복사 + nginx reload
```

**GitHub Secrets 필요값**
| Secret | 설명 |
|--------|------|
| `SSH_HOST` | VPS IP |
| `SSH_USER` | ubuntu |
| `SSH_PRIVATE_KEY` | SSH 개인키 |
| `SSH_PORT` | SSH 포트 (기본 22) |

## 상세 문서

- [아키텍처](.claude/rules/architecture.md) — 시스템 구조, AI 파이프라인
- [코딩 컨벤션](.claude/rules/coding-conventions.md) — TypeScript, Express, Prisma, AI 규칙
- [도메인 지식](.claude/rules/domain-knowledge.md) — 엔티티, 상태값, 챗봇 흐름
- [DB 스키마](docs/database.md) — 테이블 상세 명세
- [전체 아키텍처](docs/architecture.md) — 다이어그램, PWA/Capacitor 구조 포함
- [다국어(i18n)](docs/i18n.md) — 4개 언어 지원, 번역 추가 방법, 파일 구조

## 빠른 참조 (Quick References)

스킬/에이전트가 코드를 탐색하지 않고 바로 참조할 수 있는 요약 문서:

- [API 엔드포인트](.claude/references/api.md) — 전체 라우트, 인증, 요청/응답
- [DB 스키마](.claude/references/db.md) — 모델, 필드, 관계, 제약조건
- [에러 코드](.claude/references/errors.md) — ERROR_CODES → HTTP 상태 매핑
- [BullMQ 큐](.claude/references/queues.md) — 큐, 잡, cron, 파이프라인
- [환경변수](.claude/references/env.md) — 백엔드/프론트 전체 환경변수
- [프론트 라우트](.claude/references/routes.md) — URL → 컴포넌트, 인증 요구사항
