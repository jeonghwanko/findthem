import type { Request, Response, NextFunction } from 'express';

// 메모리 기반 간단 rate limiter (프로덕션에서는 Redis 기반으로 교체)
const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > options.max) {
      res
        .status(429)
        .json({ error: options.message || '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      return;
    }
    next();
  };
}

// 주기적 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

// 프리셋
export const apiLimiter = rateLimit({ windowMs: 60_000, max: 100 }); // 일반 API: 분당 100
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: '로그인 시도가 너무 많습니다.',
}); // 인증: 분당 10
export const agentLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: '에이전트 요청이 너무 많습니다.',
}); // 에이전트: 분당 20
export const adminLimiter = rateLimit({ windowMs: 60_000, max: 60 }); // 관리자: 분당 60
