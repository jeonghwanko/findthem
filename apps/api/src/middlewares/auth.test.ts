import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { requireAuth, optionalAuth, requireAdmin, requireExternalAgentAuth } from './auth.js';
import { config } from '../config.js';
import { ApiError } from './errors.js';
import { prisma } from '../db/client.js';

const userMock = (prisma as any).user;
const externalAgentMock = (prisma as any).externalAgent;

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

describe('requireExternalAgentAuth', () => {
  const RAW_KEY = 'test-raw-api-key-32bytes-long-xx';
  const HASHED_KEY = createHash('sha256').update(RAW_KEY).digest('hex');

  const testAgent = {
    id: 'agent-id-123',
    name: 'Test External Agent',
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    externalAgentMock.findUnique.mockResolvedValue({ ...testAgent, apiKey: HASHED_KEY });
    externalAgentMock.update.mockResolvedValue({});
  });

  function createExternalReq(headers: Record<string, string> = {}): Request {
    return {
      headers,
      query: {},
      externalAgent: undefined,
    } as unknown as Request;
  }

  it('유효한 키 → req.externalAgent 세팅 + next() 호출', async () => {
    const req = createExternalReq({ 'x-external-agent-key': RAW_KEY });
    const next = vi.fn();

    await requireExternalAgentAuth(req, {} as Response, next);

    expect(req.externalAgent).toBeDefined();
    expect(req.externalAgent!.id).toBe(testAgent.id);
    expect(req.externalAgent!.name).toBe(testAgent.name);
    expect(next).toHaveBeenCalledOnce();
  });

  it('x-external-agent-key 헤더 없음 → 401 에러', async () => {
    const req = createExternalReq();
    const next = vi.fn();

    await expect(requireExternalAgentAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
    const err = await requireExternalAgentAuth(req, {} as Response, next).catch((e) => e);
    expect((err as ApiError).statusCode).toBe(401);
  });

  it('존재하지 않는 키 → 401 에러', async () => {
    externalAgentMock.findUnique.mockResolvedValue(null);
    const req = createExternalReq({ 'x-external-agent-key': 'nonexistent-key' });
    const next = vi.fn();

    await expect(requireExternalAgentAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
    const err = await requireExternalAgentAuth(req, {} as Response, next).catch((e) => e);
    expect((err as ApiError).statusCode).toBe(401);
  });

  it('isActive=false 에이전트 → 403 에러', async () => {
    externalAgentMock.findUnique.mockResolvedValue({ ...testAgent, isActive: false, apiKey: HASHED_KEY });
    const req = createExternalReq({ 'x-external-agent-key': RAW_KEY });
    const next = vi.fn();

    await expect(requireExternalAgentAuth(req, {} as Response, next)).rejects.toThrow(ApiError);
    const err = await requireExternalAgentAuth(req, {} as Response, next).catch((e) => e);
    expect((err as ApiError).statusCode).toBe(403);
  });

  it('lastUsedAt fire-and-forget update 호출 확인', async () => {
    const req = createExternalReq({ 'x-external-agent-key': RAW_KEY });
    const next = vi.fn();

    await requireExternalAgentAuth(req, {} as Response, next);

    // fire-and-forget이므로 약간의 여유를 두고 확인
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(externalAgentMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { apiKey: HASHED_KEY },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });
});
