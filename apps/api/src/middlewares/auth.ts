import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { ApiError } from './errors.js';
import { ERROR_CODES } from '@findthem/shared';
import { prisma } from '../db/client.js';

export interface JwtPayload {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, ERROR_CODES.AUTH_REQUIRED);
  }

  const token = header.slice(7);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    throw new ApiError(401, ERROR_CODES.INVALID_TOKEN);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isBlocked: true },
  });
  if (!user || user.isBlocked) {
    throw new ApiError(403, ERROR_CODES.USER_BLOCKED);
  }

  req.user = payload;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = payload;
  } catch {
    // 무효한 토큰이어도 계속 진행
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  // 헤더로만 허용 (쿼리 파라미터는 URL 로그에 노출되므로 금지)
  const apiKey = req.headers['x-api-key'] as string | undefined;

  const adminKey = config.adminApiKey;
  const valid =
    apiKey &&
    adminKey &&
    apiKey.length === adminKey.length &&
    timingSafeEqual(Buffer.from(apiKey), Buffer.from(adminKey));
  if (!valid) {
    throw new ApiError(403, ERROR_CODES.ADMIN_REQUIRED);
  }
  next();
}
