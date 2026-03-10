import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from './errors.js';

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

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    throw new ApiError(401, '유효하지 않은 토큰입니다.');
  }
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

  if (apiKey !== config.adminApiKey) {
    throw new ApiError(403, '관리자 권한이 필요합니다.');
  }
  next();
}
