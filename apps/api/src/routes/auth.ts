import type { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { validateBody } from '../middlewares/validate.js';
import { ApiError } from '../middlewares/errors.js';
import { requireAuth } from '../middlewares/auth.js';
import { authLimiter, apiLimiter } from '../middlewares/rateLimit.js';
import { ERROR_CODES, MAX_FILE_SIZE } from '@findthem/shared';
import { createLogger } from '../logger.js';
import { imageService } from '../services/imageService.js';
import { storageService } from '../services/storageService.js';

const log = createLogger('auth');

/** 8자리 대문자 영숫자 레퍼럴 코드 생성 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자(0,O,1,I) 제외
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** DB에 referralCode가 없는 유저에게 유일한 코드 발급 */
async function ensureReferralCode(userId: string): Promise<string> {
  // 이미 있으면 즉시 반환
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  // 원자적 update: referralCode가 null인 경우에만 갱신 → race condition 방지
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const result = await prisma.user.updateMany({
      where: { id: userId, referralCode: null },
      data: { referralCode: code },
    });
    if (result.count > 0) return code;

    // 다른 요청이 먼저 설정한 경우 → 현재값 반환
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (current?.referralCode) return current.referralCode;
    // unique 충돌(코드 값 중복) 시 재시도
  }
  throw new ApiError(500, ERROR_CODES.SERVER_ERROR);
}

const registerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().regex(/^01[016789]\d{7,8}$/),
  password: z.string().min(6),
  email: z.string().email().optional(),
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

/** Raw HTTP cookie 헤더에서 단일 쿠키 값 추출 */
function parseCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key?.trim() === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function signToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Find or create a social login user.
 * phone 필드는 소셜 유저용 placeholder를 생성한다 (unique 제약 충족).
 * upsert 패턴으로 동시 요청 레이스 컨디션 방지.
 */
async function findOrCreateSocialUser(params: {
  provider: 'KAKAO' | 'NAVER' | 'TELEGRAM';
  providerId: string;
  name: string;
  profileImage?: string | null;
}) {
  const { provider, providerId, name, profileImage } = params;
  const phone = `social_${provider.toLowerCase()}_${providerId}`;

  // 재로그인 시 사용자가 직접 수정한 name/profileImage를 덮어쓰지 않음
  return prisma.user.upsert({
    where: { provider_providerId: { provider, providerId } },
    update: {},
    create: {
      name,
      phone,
      passwordHash: null,
      provider,
      providerId,
      ...(profileImage ? { profileImage } : {}),
    },
  });
}

/** 프론트엔드로 리다이렉트 시 토큰을 hash fragment로 전달 (query string 대비 보안 강화) */
function redirectWithToken(res: import('express').Response, token: string) {
  res.redirect(`${config.webOrigin}/auth/callback#token=${encodeURIComponent(token)}`);
}

export function registerAuthRoutes(router: Router) {
  // ── 로컬 회원가입 ──────────────────────────────────────────────────────────
  router.post('/auth/register', authLimiter, validateBody(registerSchema), async (req, res) => {
    const { name, phone, password, email } = req.body;

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await prisma.user.create({
        data: { name, phone, passwordHash, email },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(409, ERROR_CODES.PHONE_ALREADY_EXISTS);
      }
      throw err;
    }

    const token = signToken(user.id);
    res.status(201).json({
      user: { id: user.id, name: user.name, phone: user.phone, profileImage: user.profileImage, provider: user.provider },
      token,
    });
  });

  // ── 로컬 로그인 ───────────────────────────────────────────────────────────
  router.post('/auth/login', authLimiter, validateBody(loginSchema), async (req, res) => {
    const { phone, password } = req.body;

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.passwordHash) {
      throw new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS);
    }

    const token = signToken(user.id);
    res.json({
      user: { id: user.id, name: user.name, phone: user.phone, profileImage: user.profileImage, provider: user.provider },
      token,
    });
  });

  // ── 내 정보 ───────────────────────────────────────────────────────────────
  router.get('/auth/me', requireAuth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!; // requireAuth가 보장
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true, profileImage: true, provider: true, createdAt: true, referralCode: true },
    });
    if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND);

    res.json(user);
  });

  // ── 내 정보 수정 ─────────────────────────────────────────────────────────
  const updateProfileSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    email: z.string().email().optional().nullable(),
  });

  router.patch('/auth/me', requireAuth, validateBody(updateProfileSchema), async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;
    const { name, email } = req.body;

    const data: Prisma.UserUpdateInput = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
    };

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, ERROR_CODES.NO_FIELDS_TO_UPDATE);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, phone: true, email: true, profileImage: true, provider: true, createdAt: true, referralCode: true },
    });
    res.json(user);
  });

  // ── 프로필 이미지 업로드 ──────────────────────────────────────────────────
  const profileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error(ERROR_CODES.IMAGE_ONLY));
    },
  });

  router.post('/auth/me/photo', requireAuth, apiLimiter, profileUpload.single('photo'), async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;
    if (!req.file) throw new ApiError(400, ERROR_CODES.PHOTO_REQUIRED);

    // 이전 프로필 이미지 삭제 (로컬 파일만, 외부 URL 제외)
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { profileImage: true } });
    if (current?.profileImage?.startsWith('/uploads/')) {
      await storageService.deleteFile(current.profileImage).catch(() => { /* ignore */ });
    }

    let photoUrl: string;
    try {
      ({ photoUrl } = await imageService.processAndSave('profiles', req.file));
    } catch (err) {
      log.error({ err, userId }, 'Profile photo processing failed');
      throw new ApiError(500, ERROR_CODES.SERVER_ERROR);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { profileImage: photoUrl },
      select: { id: true, name: true, phone: true, email: true, profileImage: true, provider: true, createdAt: true, referralCode: true },
    });
    res.json(user);
  });

  // ── 레퍼럴 코드 발급 ─────────────────────────────────────────────────────
  // POST /auth/me/referral-code — 레퍼럴 코드 발급 (없는 경우에만 생성)
  router.post('/auth/me/referral-code', requireAuth, async (req, res) => {
    const { userId } = req.user!;
    const code = await ensureReferralCode(userId);
    res.json({ referralCode: code });
  });

  // ── Kakao OAuth ───────────────────────────────────────────────────────────

  // 카카오 로그인 진입 (브라우저 리다이렉트)
  router.get('/auth/kakao', (_req, res) => {
    const params = new URLSearchParams({
      client_id: config.kakaoRestApiKey,
      redirect_uri: config.kakaoRedirectUri,
      response_type: 'code',
    });
    res.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
  });

  // 카카오 OAuth 콜백
  router.get('/auth/kakao/callback', async (req, res) => {
    const code = req.query['code'] as string | undefined;
    if (!code) {
      log.warn('Kakao callback: code missing');
      throw new ApiError(400, ERROR_CODES.OAUTH_FAILED);
    }

    // 1. 토큰 교환
    let accessToken: string;
    try {
      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.kakaoRestApiKey,
          redirect_uri: config.kakaoRedirectUri,
          code,
        }).toString(),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        log.error({ status: tokenRes.status, body }, 'Kakao token exchange failed');
        throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
      }
      const tokenData = (await tokenRes.json()) as { access_token: string };
      accessToken = tokenData.access_token;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      log.error({ err }, 'Kakao token exchange error');
      throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
    }

    // 2. 사용자 정보 조회
    let kakaoId: string;
    let nickname: string;
    let kakaoProfileImage: string | null = null;
    try {
      const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        log.error({ status: userRes.status }, 'Kakao userinfo fetch failed');
        throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
      }
      const userData = (await userRes.json()) as {
        id: number;
        kakao_account?: { profile?: { nickname?: string; profile_image_url?: string } };
      };
      kakaoId = String(userData.id);
      nickname = userData.kakao_account?.profile?.nickname ?? 'KakaoUser';
      kakaoProfileImage = (userData.kakao_account?.profile?.profile_image_url ?? null)?.replace(/^http:\/\//, 'https://') ?? null;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      log.error({ err }, 'Kakao userinfo error');
      throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
    }

    // 3. DB 유저 조회/생성
    const user = await findOrCreateSocialUser({
      provider: 'KAKAO',
      providerId: kakaoId,
      name: nickname,
      profileImage: kakaoProfileImage,
    });
    log.info({ userId: user.id, kakaoId }, 'Kakao login success');

    const token = signToken(user.id);
    redirectWithToken(res, token);
  });

  // ── Naver OAuth ───────────────────────────────────────────────────────────

  // 네이버 로그인 진입 (CSRF state를 쿠키에 저장)
  router.get('/auth/naver', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('naver_oauth_state', state, {
      httpOnly: true,
      maxAge: 5 * 60 * 1000, // 5분
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
    });

    const params = new URLSearchParams({
      client_id: config.naverClientId,
      redirect_uri: config.naverRedirectUri,
      response_type: 'code',
      state,
    });
    res.redirect(`https://nid.naver.com/oauth2.0/authorize?${params.toString()}`);
  });

  // 네이버 OAuth 콜백
  router.get('/auth/naver/callback', async (req, res) => {
    const code = req.query['code'] as string | undefined;
    const state = req.query['state'] as string | undefined;
    const savedState = parseCookieValue(req.headers.cookie, 'naver_oauth_state');

    if (!code || !state) {
      log.warn('Naver callback: code or state missing');
      throw new ApiError(400, ERROR_CODES.OAUTH_FAILED);
    }
    if (!savedState || state !== savedState) {
      log.warn({ state, savedState }, 'Naver callback: state mismatch');
      throw new ApiError(400, ERROR_CODES.OAUTH_INVALID_STATE);
    }

    // state 쿠키 즉시 제거 (설정 시와 동일한 옵션 필요)
    res.clearCookie('naver_oauth_state', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
    });

    // 1. 토큰 교환
    let accessToken: string;
    try {
      const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.naverClientId,
          client_secret: config.naverClientSecret,
          redirect_uri: config.naverRedirectUri,
          code,
          state,
        }).toString(),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        log.error({ status: tokenRes.status, body }, 'Naver token exchange failed');
        throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
      }
      const tokenData = (await tokenRes.json()) as { access_token: string };
      accessToken = tokenData.access_token;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      log.error({ err }, 'Naver token exchange error');
      throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
    }

    // 2. 사용자 정보 조회
    let naverId: string;
    let naverName: string;
    let naverProfileImage: string | null = null;
    try {
      const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        log.error({ status: userRes.status }, 'Naver userinfo fetch failed');
        throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
      }
      const userData = (await userRes.json()) as {
        response?: { id?: string; name?: string; profile_image?: string };
      };
      naverId = userData.response?.id ?? '';
      naverName = userData.response?.name ?? 'NaverUser';
      naverProfileImage = (userData.response?.profile_image ?? null)?.replace(/^http:\/\//, 'https://') ?? null;
      if (!naverId) {
        log.error({ userData }, 'Naver userinfo: id missing');
        throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      log.error({ err }, 'Naver userinfo error');
      throw new ApiError(502, ERROR_CODES.OAUTH_FAILED);
    }

    // 3. DB 유저 조회/생성
    const user = await findOrCreateSocialUser({
      provider: 'NAVER',
      providerId: naverId,
      name: naverName,
      profileImage: naverProfileImage,
    });
    log.info({ userId: user.id, naverId }, 'Naver login success');

    const token = signToken(user.id);
    redirectWithToken(res, token);
  });

  // ── Telegram OAuth ────────────────────────────────────────────────────────

  // 텔레그램 로그인 진입 (Telegram Login Widget 방식)
  router.get('/auth/telegram', (req, res) => {
    const botId = config.telegramBotToken.split(':')[0] ?? '';
    // return_to: 인증 완료 후 리다이렉트될 콜백 URL
    // return_to를 프론트 콜백 페이지로 지정 (텔레그램은 fragment로 데이터 전달)
    const callbackUrl = `${config.siteUrl}/auth/callback`;
    const params = new URLSearchParams({
      bot_id: botId,
      origin: config.siteUrl,
      return_to: callbackUrl,
      request_access: 'write',
    });
    res.redirect(`https://oauth.telegram.org/auth?${params.toString()}`);
  });

  // 텔레그램 OAuth 콜백 — 프론트가 fragment를 파싱하여 POST로 전달
  router.post('/auth/telegram/callback', async (req, res) => {
    const body = req.body as Record<string, string>;
    const { hash, ...authData } = body;

    if (!hash) {
      log.warn('Telegram callback: hash missing');
      throw new ApiError(400, ERROR_CODES.OAUTH_TELEGRAM_INVALID);
    }

    // Telegram 서명 검증
    // https://core.telegram.org/widgets/login#checking-authorization
    const dataCheckString = Object.keys(authData)
      .sort()
      .map((k) => `${k}=${authData[k]}`)
      .join('\n');

    const secretKey = crypto
      .createHash('sha256')
      .update(config.telegramBotToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      log.warn({ hash, expectedHash }, 'Telegram callback: hash mismatch');
      throw new ApiError(401, ERROR_CODES.OAUTH_TELEGRAM_INVALID);
    }

    // auth_date 만료 확인 (1시간)
    const authDate = parseInt(authData['auth_date'] ?? '0', 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 3600) {
      log.warn({ authDate, nowSec }, 'Telegram callback: auth_date expired');
      throw new ApiError(401, ERROR_CODES.OAUTH_TELEGRAM_INVALID);
    }

    const telegramId = String(authData['id'] ?? '');
    if (!telegramId) {
      log.warn('Telegram callback: id missing');
      throw new ApiError(400, ERROR_CODES.OAUTH_TELEGRAM_INVALID);
    }

    const firstName = authData['first_name'] ?? '';
    const lastName = authData['last_name'] ?? '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || 'TelegramUser';
    const telegramPhoto = authData['photo_url'] ?? null;

    // DB 유저 조회/생성
    const user = await findOrCreateSocialUser({
      provider: 'TELEGRAM',
      providerId: telegramId,
      name,
      profileImage: telegramPhoto,
    });
    log.info({ userId: user.id, telegramId }, 'Telegram login success');

    const token = signToken(user.id);
    res.json({ token });
  });
}
