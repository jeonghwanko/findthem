import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// jose의 JWKS / jwtVerify를 mock (모듈 로드 시점에 APPLE_JWKS가 생성되므로 호이스팅 필수)
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Apple Auth E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
  });

  // ── GET /api/auth/apple ────────────────────────────────────────────────────
  describe('GET /api/auth/apple', () => {
    it('302 리다이렉트 + appleid.apple.com URL', async () => {
      const res = await app.get('/api/auth/apple');

      expect(res.status).toBe(302);
      expect(res.headers['location']).toMatch(/^https:\/\/appleid\.apple\.com\/auth\/authorize/);
    });

    it('리다이렉트 URL에 필수 파라미터 포함 (response_type, response_mode, scope)', async () => {
      const res = await app.get('/api/auth/apple');

      const location = res.headers['location'] as string;
      expect(location).toContain('response_type=code+id_token');
      expect(location).toContain('response_mode=form_post');
      expect(location).toContain('scope=name+email');
    });

    it('apple_oauth_state 쿠키 설정 확인', async () => {
      const res = await app.get('/api/auth/apple');

      const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
      const cookieArray = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
      const stateCookie = cookieArray.find((c) => c.startsWith('apple_oauth_state='));

      expect(stateCookie).toBeDefined();
      expect(stateCookie).toContain('HttpOnly');
      expect(stateCookie).toContain('SameSite=None');
    });
  });

  // ── POST /api/auth/apple/callback ─────────────────────────────────────────
  describe('POST /api/auth/apple/callback', () => {
    it('state 불일치 → /login?error=apple_failed 리다이렉트', async () => {
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', 'apple_oauth_state=correct-state')
        .send({
          id_token: 'some-id-token',
          state: 'wrong-state',
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login?error=apple_failed');
    });

    it('state 누락 → /login?error=apple_failed 리다이렉트', async () => {
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', 'apple_oauth_state=some-state')
        .send({
          id_token: 'some-id-token',
          // state 필드 없음
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login?error=apple_failed');
    });

    it('쿠키에 state 없음 → /login?error=apple_failed 리다이렉트', async () => {
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        // 쿠키 미설정
        .send({
          id_token: 'some-id-token',
          state: 'some-state',
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login?error=apple_failed');
    });

    it('id_token 누락 → /login?error=apple_failed 리다이렉트', async () => {
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', 'apple_oauth_state=some-state')
        .send({
          state: 'some-state',
          // id_token 없음
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login?error=apple_failed');
    });

    it('id_token 검증 실패 (jwtVerify throw) → /login?error=apple_failed 리다이렉트', async () => {
      const { jwtVerify } = await import('jose');
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid token signature'));

      const state = 'valid-csrf-state';
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', `apple_oauth_state=${state}`)
        .send({
          id_token: 'invalid-id-token',
          state,
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login?error=apple_failed');
    });

    it('id_token의 sub가 숫자 등 비문자열 → /login?error=apple_failed 리다이렉트', async () => {
      const { jwtVerify } = await import('jose');
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { sub: 12345, iss: 'https://appleid.apple.com' },
        protectedHeader: { alg: 'RS256', kid: 'test-kid' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const state = 'valid-csrf-state';
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', `apple_oauth_state=${state}`)
        .send({
          id_token: 'valid-format-token',
          state,
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login?error=apple_failed');
    });

    it('정상 로그인 성공 → /auth/callback#token= 리다이렉트', async () => {
      const { jwtVerify } = await import('jose');
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: 'apple-user-12345',
          email: 'user@privaterelay.appleid.com',
          iss: 'https://appleid.apple.com',
        },
        protectedHeader: { alg: 'RS256', kid: 'test-kid' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      prismaMock.user.upsert.mockResolvedValue({
        id: 'new-apple-user-id',
        name: 'AppleUser',
        phone: null,
        provider: 'APPLE',
        profileImage: null,
      });

      const state = 'valid-csrf-state';
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', `apple_oauth_state=${state}`)
        .send({
          id_token: 'valid-id-token',
          state,
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/auth/callback#token=');
    });

    it('user JSON 포함 시 이름 파싱 적용', async () => {
      const { jwtVerify } = await import('jose');
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: 'apple-user-99999',
          iss: 'https://appleid.apple.com',
        },
        protectedHeader: { alg: 'RS256', kid: 'test-kid' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      prismaMock.user.upsert.mockResolvedValue({
        id: 'apple-named-user-id',
        name: 'John Doe',
        phone: null,
        provider: 'APPLE',
        profileImage: null,
      });

      const state = 'valid-csrf-state';
      const res = await app
        .post('/api/auth/apple/callback')
        .type('form')
        .set('Cookie', `apple_oauth_state=${state}`)
        .send({
          id_token: 'valid-id-token',
          state,
          user: JSON.stringify({ name: { firstName: 'John', lastName: 'Doe' } }),
        });

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/auth/callback#token=');

      // upsert 호출 시 name이 올바르게 파싱되었는지 확인
      expect(prismaMock.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ name: 'John Doe' }),
        }),
      );
    });
  });
});
