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
      prismaMock.user.findUnique.mockResolvedValue(testUser);

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
  });
});
