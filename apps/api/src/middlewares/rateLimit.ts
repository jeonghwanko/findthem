import type { Request, Response, NextFunction } from 'express';
import IORedis from 'ioredis';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('rateLimit');

// ── Redis 연결 (실패 시 메모리 폴백) ──
let redis: InstanceType<typeof IORedis> | null = null;
let useRedis = false;

try {
  redis = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  redis.connect().then(() => {
    useRedis = true;
    log.info('Rate limiter: Redis connected');
  }).catch(() => {
    useRedis = false;
    log.warn('Rate limiter: Redis unavailable, using memory fallback');
  });
  redis.on('error', () => {
    if (useRedis) {
      useRedis = false;
      log.warn('Rate limiter: Redis connection lost, falling back to memory');
    }
  });
  redis.on('connect', () => {
    if (!useRedis) {
      useRedis = true;
      log.info('Rate limiter: Redis reconnected');
    }
  });
} catch {
  log.warn('Rate limiter: Redis init failed, using memory fallback');
}

// ── 메모리 폴백 스토어 ──
const memStore = new Map<string, { count: number; resetAt: number }>();

// 주기적 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now > entry.resetAt) memStore.delete(key);
  }
}, 60_000);

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const windowSec = Math.ceil(options.windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const key = `rl:${ip}:${options.max}:${windowSec}`;

    try {
      if (useRedis && redis) {
        // Redis: INCR + EXPIRE 패턴 (sliding window 근사)
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, windowSec);
        }
        if (count > options.max) {
          res.status(429).json({ error: options.message || 'RATE_LIMIT_EXCEEDED' });
          return;
        }
        next();
        return;
      }
    } catch {
      // Redis 에러 시 메모리 폴백으로 진행
    }

    // 메모리 폴백
    const now = Date.now();
    const entry = memStore.get(key);

    if (!entry || now > entry.resetAt) {
      memStore.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > options.max) {
      res.status(429).json({ error: options.message || 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    next();
  };
}

/** 테스트 전용: rate limiter 스토어 초기화 */
export function clearRateLimitStore() {
  memStore.clear();
  // 테스트에서는 Redis를 사용하지 않으므로 메모리만 초기화
}

// 프리셋
export const apiLimiter = rateLimit({ windowMs: 60_000, max: 100 }); // 일반 API: 분당 100
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: 'RATE_LIMIT_EXCEEDED',
}); // 인증: 분당 10
export const agentLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'RATE_LIMIT_EXCEEDED',
}); // 에이전트: 분당 20
export const adminLimiter = rateLimit({ windowMs: 60_000, max: 60 }); // 관리자: 분당 60
export const chatMessageLimiter = rateLimit({ windowMs: 60_000, max: 30 }); // 챗봇 메시지: 분당 30
export const webhookLimiter = rateLimit({ windowMs: 60_000, max: 60 }); // 외부 웹훅: 분당 60
export const communityLimiter = rateLimit({ windowMs: 60_000, max: 10 }); // 커뮤니티 작성: 분당 10
