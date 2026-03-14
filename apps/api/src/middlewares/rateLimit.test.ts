import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { rateLimit } from './rateLimit.js';

// rateLimit은 모듈 레벨의 Map(store)을 사용하므로
// 각 테스트에서 독립된 ip를 사용하거나, 새 limiter 인스턴스를 생성한다

let ipCounter = 0;
function uniqueIp(): string {
  return `192.168.1.${++ipCounter}`;
}

function createMockReq(ip: string = uniqueIp()): Request {
  return { ip } as unknown as Request;
}

function createMockRes(): { res: Response; statusCode: number; body: unknown } {
  const ctx = { statusCode: 200, body: undefined as unknown };
  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      ctx.statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: unknown) => {
      ctx.body = data;
      return res;
    }),
  } as unknown as Response;
  return { res, statusCode: ctx.statusCode, body: ctx.body };
}

describe('rateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('제한 이내 요청', () => {
    it('첫 번째 요청은 next()를 호출한다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 5 });
      const req = createMockReq();
      const { res } = createMockRes();
      const next = vi.fn();

      limiter(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('max 횟수 이내의 요청은 모두 next()를 호출한다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 3 });
      const ip = uniqueIp();
      const next = vi.fn();

      for (let i = 0; i < 3; i++) {
        const req = createMockReq(ip);
        const { res } = createMockRes();
        limiter(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(3);
    });
  });

  describe('제한 초과 요청', () => {
    it('max를 초과하면 429 응답을 반환한다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 2 });
      const ip = uniqueIp();

      // 1, 2번 정상 통과
      for (let i = 0; i < 2; i++) {
        const req = createMockReq(ip);
        const { res } = createMockRes();
        const next = vi.fn();
        limiter(req, res, next);
      }

      // 3번째 요청: 초과
      const req = createMockReq(ip);
      const { res } = createMockRes();
      const next = vi.fn();
      limiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('제한 초과 시 next()를 호출하지 않는다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 1 });
      const ip = uniqueIp();

      // 1번 통과
      limiter(createMockReq(ip), createMockRes().res, vi.fn());

      // 2번째 초과
      const next = vi.fn();
      limiter(createMockReq(ip), createMockRes().res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it('기본 에러 메시지로 응답한다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 1 });
      const ip = uniqueIp();

      limiter(createMockReq(ip), createMockRes().res, vi.fn());

      const { res } = createMockRes();
      const jsonMock = vi.fn();
      (res as any).json = jsonMock;
      (res as any).status = vi.fn().mockReturnValue(res);

      limiter(createMockReq(ip), res, vi.fn());

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it('커스텀 message 옵션이 에러 응답에 포함된다', () => {
      const customMessage = '로그인 시도가 너무 많습니다.';
      const limiter = rateLimit({ windowMs: 60_000, max: 1, message: customMessage });
      const ip = uniqueIp();

      limiter(createMockReq(ip), createMockRes().res, vi.fn());

      const { res } = createMockRes();
      const jsonMock = vi.fn();
      (res as any).json = jsonMock;
      (res as any).status = vi.fn().mockReturnValue(res);

      limiter(createMockReq(ip), res, vi.fn());

      expect(jsonMock).toHaveBeenCalledWith({ error: customMessage });
    });
  });

  describe('IP별 독립 카운팅', () => {
    it('서로 다른 IP는 각자 독립적으로 카운팅된다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 1 });
      const ip1 = uniqueIp();
      const ip2 = uniqueIp();

      const next1 = vi.fn();
      const next2 = vi.fn();

      limiter(createMockReq(ip1), createMockRes().res, next1);
      limiter(createMockReq(ip2), createMockRes().res, next2);

      expect(next1).toHaveBeenCalledOnce();
      expect(next2).toHaveBeenCalledOnce();
    });

    it('IP1이 제한을 초과해도 IP2는 정상 통과한다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 1 });
      const ip1 = uniqueIp();
      const ip2 = uniqueIp();

      // ip1 통과 후 초과
      limiter(createMockReq(ip1), createMockRes().res, vi.fn());
      const blockedNext = vi.fn();
      limiter(createMockReq(ip1), createMockRes().res, blockedNext);
      expect(blockedNext).not.toHaveBeenCalled();

      // ip2는 독립적으로 통과
      const ip2Next = vi.fn();
      limiter(createMockReq(ip2), createMockRes().res, ip2Next);
      expect(ip2Next).toHaveBeenCalledOnce();
    });
  });

  describe('req.ip가 없는 경우', () => {
    it('ip가 undefined이면 unknown 키로 처리하고 next()를 호출한다', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 100 });
      const req = { ip: undefined } as unknown as Request;
      const { res } = createMockRes();
      const next = vi.fn();

      limiter(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('프리셋 limiter 임포트 확인', () => {
    it('apiLimiter, authLimiter, agentLimiter, adminLimiter가 export된다', async () => {
      const module = await import('./rateLimit.js');

      expect(typeof module.apiLimiter).toBe('function');
      expect(typeof module.authLimiter).toBe('function');
      expect(typeof module.agentLimiter).toBe('function');
      expect(typeof module.adminLimiter).toBe('function');
    });
  });
});
