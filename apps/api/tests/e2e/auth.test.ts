import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createTestApp, authHeader, testUser } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// setup.ts의 vi.mock 팩토리가 생성한 실제 mock 객체를 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Auth E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
  });

  // ── POST /api/auth/register ──
  describe('POST /api/auth/register', () => {
    it('회원가입 성공 → 201 + user + token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null); // 중복 없음
      prismaMock.user.create.mockResolvedValue({
        id: 'new-user-id',
        name: '테스트',
        phone: '01099887766',
        email: null,
        passwordHash: 'hashed',
        provider: 'LOCAL',
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app
        .post('/api/auth/register')
        .send({ name: '테스트', phone: '01099887766', password: 'pass123' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.name).toBe('테스트');
    });

    it('중복 전화번호 → 409', async () => {
      // P2002 unique constraint violation을 시뮬레이션
      const { Prisma } = await import('@prisma/client');
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.0.0' });
      prismaMock.user.create.mockRejectedValue(p2002);

      const res = await app
        .post('/api/auth/register')
        .send({ name: '중복', phone: '01012345678', password: 'pass123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('PHONE_ALREADY_EXISTS');
    });

    it('유효성 실패 (잘못된 전화번호) → 400', async () => {
      const res = await app
        .post('/api/auth/register')
        .send({ name: '테스트', phone: '12345', password: 'pass123' });

      expect(res.status).toBe(400);
    });

    it('유효성 실패 (비밀번호 6자 미만) → 400', async () => {
      const res = await app
        .post('/api/auth/register')
        .send({ name: '테스트', phone: '01099887766', password: '123' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/login ──
  describe('POST /api/auth/login', () => {
    it('로그인 성공 → 200 + token', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findUnique.mockResolvedValue({ ...testUser, passwordHash: hash });

      const res = await app
        .post('/api/auth/login')
        .send({ phone: '01012345678', password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token');
    });

    it('잘못된 비밀번호 → 401', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findUnique.mockResolvedValue({ ...testUser, passwordHash: hash });

      const res = await app
        .post('/api/auth/login')
        .send({ phone: '01012345678', password: 'wrong-password' });

      expect(res.status).toBe(401);
    });

    it('미존재 유저 → 401', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await app
        .post('/api/auth/login')
        .send({ phone: '01000000000', password: 'any' });

      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/auth/me ──
  describe('GET /api/auth/me', () => {
    it('유효한 토큰 → 200 + 유저 정보', async () => {
      // requireAuth의 findUnique(select: {isBlocked}) 호출과
      // /auth/me의 findUnique(select: {id,name,...}) 호출을 순서대로 처리
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })   // requireAuth용
        .mockResolvedValueOnce({                        // /auth/me 핸들러용
          id: testUser.id,
          name: testUser.name,
          phone: testUser.phone,
          email: testUser.email,
          createdAt: testUser.createdAt,
        });

      const res = await app
        .get('/api/auth/me')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('테스트 유저');
    });

    it('토큰 없음 → 401', async () => {
      const res = await app.get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('응답에 profileImage, provider 필드 포함', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({
          id: testUser.id,
          name: testUser.name,
          phone: testUser.phone,
          email: testUser.email,
          profileImage: 'https://example.com/avatar.jpg',
          provider: 'LOCAL',
          createdAt: testUser.createdAt,
        });

      const res = await app
        .get('/api/auth/me')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('profileImage', 'https://example.com/avatar.jpg');
      expect(res.body).toHaveProperty('provider', 'LOCAL');
    });

    it('소셜 로그인 유저 — provider가 LOCAL 이외 값으로 응답', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({
          id: 'kakao-user-id',
          name: '카카오유저',
          phone: 'social_kakao_12345678',
          email: null,
          profileImage: 'https://k.kakaocdn.net/dn/profile.jpg',
          provider: 'KAKAO',
          createdAt: new Date('2025-01-01'),
        });

      const res = await app
        .get('/api/auth/me')
        .set('Authorization', authHeader('kakao-user-id'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('provider', 'KAKAO');
      expect(res.body).toHaveProperty('profileImage', 'https://k.kakaocdn.net/dn/profile.jpg');
    });

    it('profileImage가 null인 경우도 정상 응답', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({
          id: testUser.id,
          name: testUser.name,
          phone: testUser.phone,
          email: null,
          profileImage: null,
          provider: 'LOCAL',
          createdAt: testUser.createdAt,
        });

      const res = await app
        .get('/api/auth/me')
        .set('Authorization', authHeader());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('profileImage', null);
      expect(res.body).toHaveProperty('provider', 'LOCAL');
    });
  });

  // ── POST /api/auth/me/photo ──
  describe('POST /api/auth/me/photo', () => {
    // 1x1 픽셀 최소 PNG (유효한 이미지 바이너리)
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    it('인증 없이 접근 → 401', async () => {
      const res = await app
        .post('/api/auth/me/photo')
        .attach('photo', tinyPng, { filename: 'avatar.png', contentType: 'image/png' });

      expect(res.status).toBe(401);
    });

    it('파일 없이 요청 → 400 (PHOTO_REQUIRED)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });

      const res = await app
        .post('/api/auth/me/photo')
        .set('Authorization', authHeader());

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PHOTO_REQUIRED');
    });

    it('이미지 파일 업로드 성공 → 200, profileImage 필드 포함', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
      prismaMock.user.update.mockResolvedValue({
        id: testUser.id,
        name: testUser.name,
        phone: testUser.phone,
        email: testUser.email,
        profileImage: '/uploads/profiles/mock-photo.jpg',
        provider: 'LOCAL',
        createdAt: testUser.createdAt,
      });

      const res = await app
        .post('/api/auth/me/photo')
        .set('Authorization', authHeader())
        .attach('photo', tinyPng, { filename: 'avatar.png', contentType: 'image/png' });

      // setup.ts의 imageService mock은 photoUrl: '/uploads/reports/mock-photo.jpg' 반환
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('profileImage', '/uploads/profiles/mock-photo.jpg');
      expect(prismaMock.user.update).toHaveBeenCalledOnce();
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testUser.id },
          data: { profileImage: '/uploads/reports/mock-photo.jpg' }, // imageService mock 고정 반환값
        }),
      );
    });

    it('이미지가 아닌 파일 업로드 → multer fileFilter 에러', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });

      const textBuffer = Buffer.from('not an image content');

      const res = await app
        .post('/api/auth/me/photo')
        .set('Authorization', authHeader())
        .attach('photo', textBuffer, { filename: 'document.txt', contentType: 'text/plain' });

      // multer fileFilter가 cb(new Error(ERROR_CODES.IMAGE_ONLY))를 throw
      // → errorHandler에서 ApiError/ZodError 외 에러로 처리 → 500
      expect(res.status).toBe(500);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  // ── PATCH /api/auth/me ──
  describe('PATCH /api/auth/me', () => {
    it('이름 수정 성공 → 200 + 수정된 유저 정보', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
      prismaMock.user.update.mockResolvedValue({
        id: testUser.id,
        name: '새이름',
        phone: testUser.phone,
        email: null,
        profileImage: null,
        provider: 'LOCAL',
        createdAt: testUser.createdAt,
      });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ name: '새이름' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('새이름');
      expect(prismaMock.user.update).toHaveBeenCalledOnce();
    });

    it('이메일 수정 성공 → 200 + 수정된 유저 정보', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
      prismaMock.user.update.mockResolvedValue({
        id: testUser.id,
        name: testUser.name,
        phone: testUser.phone,
        email: 'new@example.com',
        profileImage: null,
        provider: 'LOCAL',
        createdAt: testUser.createdAt,
      });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ email: 'new@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('new@example.com');
    });

    it('이름 + 이메일 동시 수정 → 200', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
      prismaMock.user.update.mockResolvedValue({
        id: testUser.id,
        name: '동시수정',
        phone: testUser.phone,
        email: 'both@example.com',
        profileImage: null,
        provider: 'LOCAL',
        createdAt: testUser.createdAt,
      });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ name: '동시수정', email: 'both@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('동시수정');
      expect(res.body.email).toBe('both@example.com');
    });

    it('빈 body → 400 (NO_FIELDS_TO_UPDATE)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({});

      expect(res.status).toBe(400);
      // ApiError → { error: errorCode }, ZodError → { error: "field: message" }
      expect(res.body).toHaveProperty('error');
    });

    it('인증 없이 접근 → 401', async () => {
      const res = await app
        .patch('/api/auth/me')
        .send({ name: '수정시도' });

      expect(res.status).toBe(401);
    });

    it('유효하지 않은 이메일 형식 → 400', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('이름이 빈 문자열 → 400', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('이름이 50자 초과 → 400', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ name: 'a'.repeat(51) });

      expect(res.status).toBe(400);
    });

    it('응답에 profileImage, provider 필드 포함', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
      prismaMock.user.update.mockResolvedValue({
        id: testUser.id,
        name: '수정된이름',
        phone: testUser.phone,
        email: null,
        profileImage: 'https://example.com/avatar.jpg',
        provider: 'LOCAL',
        createdAt: testUser.createdAt,
      });

      const res = await app
        .patch('/api/auth/me')
        .set('Authorization', authHeader())
        .send({ name: '수정된이름' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('profileImage');
      expect(res.body).toHaveProperty('provider');
    });
  });
});
