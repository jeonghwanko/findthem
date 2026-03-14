import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth, optionalAuth, requireAdmin } from './auth.js';
import { config } from '../config.js';
import { ApiError } from './errors.js';
import { prisma } from '../db/client.js';

const userMock = (prisma as any).user;

function createMockReq(headers: Record<string, string> = {}, query: Record<string, string> = {}): Request {
  return {
    headers,
    query,
    user: undefined,
  } as unknown as Request;
}

const TEST_USER_ID = 'test-user-123';

function createValidToken(): string {
  return jwt.sign({ userId: TEST_USER_ID }, config.jwtSecret, {
    expiresIn: '1h',
  } as jwt.SignOptions);
}

describe('requireAuth', () => {
  it('유효한 Bearer 토큰 → req.user 설정 + next() 호출', async () => {
    userMock.findUnique.mockResolvedValue({ isBlocked: false });
    const token = createValidToken();
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();

    await requireAuth(req, {} as Response, next);

    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe(TEST_USER_ID);
    expect(next).toHaveBeenCalledOnce();
  });

  it('Authorization 헤더 없음 → 401 에러', async () => {
    const req = createMockReq();
    const next = vi.fn();

    await expect(requireAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
  });

  it('Bearer 접두사 없음 → 401 에러', async () => {
    const req = createMockReq({ authorization: 'InvalidToken' });
    const next = vi.fn();

    await expect(requireAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
  });

  it('만료된 토큰 → 401 에러', async () => {
    const expiredToken = jwt.sign({ userId: TEST_USER_ID }, config.jwtSecret, {
      expiresIn: '-1s',
    } as jwt.SignOptions);
    const req = createMockReq({ authorization: `Bearer ${expiredToken}` });
    const next = vi.fn();

    await expect(requireAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
  });

  it('잘못된 시크릿 토큰 → 401 에러', async () => {
    const badToken = jwt.sign({ userId: TEST_USER_ID }, 'wrong-secret');
    const req = createMockReq({ authorization: `Bearer ${badToken}` });
    const next = vi.fn();

    await expect(requireAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
  });

  it('차단된 유저 → 403 에러', async () => {
    userMock.findUnique.mockResolvedValue({ isBlocked: true });
    const token = createValidToken();
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();

    await expect(requireAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
  });
});

describe('optionalAuth', () => {
  it('유효한 토큰 → req.user 설정 + next() 호출', () => {
    const token = createValidToken();
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe(TEST_USER_ID);
    expect(next).toHaveBeenCalledOnce();
  });

  it('헤더 없음 → user 없이 next() 호출', () => {
    const req = createMockReq();
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('무효한 토큰 → user 없이 next() 호출 (에러 없음)', () => {
    const req = createMockReq({ authorization: 'Bearer invalid-token' });
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireAdmin', () => {
  it('올바른 x-api-key 헤더 → next() 호출', () => {
    const req = createMockReq({ 'x-api-key': config.adminApiKey });
    const next = vi.fn();

    requireAdmin(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('apiKey 쿼리 파라미터 → 헤더 없으면 403 (쿼리 파라미터 인증 비허용)', () => {
    const req = createMockReq({}, { apiKey: config.adminApiKey });
    const next = vi.fn();

    expect(() => {
      requireAdmin(req, {} as Response, next);
    }).toThrow(ApiError);
  });

  it('잘못된 API key → 403 에러', () => {
    const req = createMockReq({ 'x-api-key': 'wrong-key' });
    const next = vi.fn();

    expect(() => {
      requireAdmin(req, {} as Response, next);
    }).toThrow(ApiError);

    try {
      requireAdmin(req, {} as Response, next);
    } catch (err) {
      expect((err as ApiError).statusCode).toBe(403);
    }
  });

  it('API key 없음 → 403 에러', () => {
    const req = createMockReq();
    const next = vi.fn();

    expect(() => {
      requireAdmin(req, {} as Response, next);
    }).toThrow(ApiError);
  });
});
