import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// setup.ts의 vi.mock 팩토리가 생성한 실제 mock 객체를 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Auth Referral XP E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
    // XP 관련 mock — grantXp 내부에서 사용
    // REFERRAL has dailyLimit:10 → $executeRaw 조건부 INSERT 사용
    prismaMock.xpLog = {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    };
    prismaMock.$executeRaw = vi.fn().mockResolvedValue(1);
    prismaMock.$queryRaw = vi.fn().mockResolvedValue([{ xp: 0 }]);
    prismaMock.user.update.mockResolvedValue({});
  });

  // ── POST /api/auth/register with referralCode ──
  describe('POST /api/auth/register (레퍼럴 코드)', () => {
    it('유효한 레퍼럴 코드로 가입 → 201 + 추천인 XP 지급 시도', async () => {
      const referrerId = 'referrer-user-id';
      // register는 비인증 엔드포인트 — requireAuth 없음
      // findUnique: referralCode로 추천인 조회 (#1)
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: referrerId });
      prismaMock.user.create.mockResolvedValue({
        id: 'new-user-id', name: '신규', phone: '01011112222', email: null,
        passwordHash: 'hashed', provider: 'LOCAL', isVerified: false,
        createdAt: new Date(), updatedAt: new Date(),
        profileImage: null,
      });
      // grantXp(referrerId, 'REFERRAL') — dailyLimit:10 → $executeRaw
      prismaMock.$executeRaw.mockResolvedValue(1);
      prismaMock.$queryRaw.mockResolvedValue([{ xp: 0 }]);

      const res = await app
        .post('/api/auth/register')
        .send({ name: '신규', phone: '01011112222', password: 'pass123', referralCode: 'ABCDEFGH' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      // grantXp는 fire-and-forget이므로 응답 후 비동기 실행
      await new Promise((r) => setTimeout(r, 20));
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('존재하지 않는 레퍼럴 코드 → 가입은 성공 + XP 미지급', async () => {
      // referrer 조회 → null
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'new-user-id', name: '신규2', phone: '01033334444', email: null,
        passwordHash: 'hashed', provider: 'LOCAL', isVerified: false,
        createdAt: new Date(), updatedAt: new Date(),
        profileImage: null,
      });

      const res = await app
        .post('/api/auth/register')
        .send({ name: '신규2', phone: '01033334444', password: 'pass123', referralCode: 'INVALID1' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      await new Promise((r) => setTimeout(r, 20));
      // referrer 없으면 grantXp 호출 안 됨 → $executeRaw 미호출
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('레퍼럴 코드 없이 가입 → 201 정상 + XP 미지급', async () => {
      prismaMock.user.create.mockResolvedValue({
        id: 'new-user-id', name: '일반', phone: '01055556666', email: null,
        passwordHash: 'hashed', provider: 'LOCAL', isVerified: false,
        createdAt: new Date(), updatedAt: new Date(),
        profileImage: null,
      });

      const res = await app
        .post('/api/auth/register')
        .send({ name: '일반', phone: '01055556666', password: 'pass123' });

      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 20));
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });
  });

  // ── POST /api/auth/me/apply-referral ──
  describe('POST /api/auth/me/apply-referral', () => {
    it('유효한 코드 적용 + 추천인이 다른 사람 → { applied: true } + XP 지급', async () => {
      const referrerId = 'referrer-id';
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })    // requireAuth
        .mockResolvedValueOnce({ id: referrerId });      // referralCode로 추천인 조회
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 }); // 원자적 업데이트 성공
      // grantXp(referrerId, 'REFERRAL') — dailyLimit:10 → $executeRaw
      prismaMock.$executeRaw.mockResolvedValue(1);
      prismaMock.$queryRaw.mockResolvedValue([{ xp: 0 }]);

      const res = await app
        .post('/api/auth/me/apply-referral')
        .set('Authorization', authHeader())
        .send({ referralCode: 'ABCDEFGH' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ applied: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('자기 자신의 코드 → { applied: false }', async () => {
      // referrer.id === req.user.userId ('test-user-id') → early return
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })       // requireAuth
        .mockResolvedValueOnce({ id: 'test-user-id' });    // 자기 자신의 코드

      const res = await app
        .post('/api/auth/me/apply-referral')
        .set('Authorization', authHeader())
        .send({ referralCode: 'SELFCODE' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ applied: false });
      await new Promise((r) => setTimeout(r, 20));
      // 자기 자신 코드 → updateMany 호출 없음 → grantXp 호출 없음
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('이미 추천인 있음 (updateMany count=0) → { applied: false }', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce({ id: 'other-referrer-id' });
      // 원자적 업데이트 실패 (이미 추천인 설정됨)
      prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

      const res = await app
        .post('/api/auth/me/apply-referral')
        .set('Authorization', authHeader())
        .send({ referralCode: 'ABCDEFGH' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ applied: false });
      await new Promise((r) => setTimeout(r, 20));
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('존재하지 않는 코드 → { applied: false }', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ isBlocked: false })
        .mockResolvedValueOnce(null); // referrer 없음

      const res = await app
        .post('/api/auth/me/apply-referral')
        .set('Authorization', authHeader())
        .send({ referralCode: 'NOTFOUND' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ applied: false });
    });

    it('토큰 없음 → 401', async () => {
      const res = await app
        .post('/api/auth/me/apply-referral')
        .send({ referralCode: 'ABCDEFGH' });

      expect(res.status).toBe(401);
    });

    it('코드 길이 8자 아닌 경우 → 400', async () => {
      const res = await app
        .post('/api/auth/me/apply-referral')
        .set('Authorization', authHeader())
        .send({ referralCode: 'SHORT' });

      expect(res.status).toBe(400);
    });
  });
});
