import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('errors');

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // 라우트에서 z.parse()로 직접 검증할 때 발생하는 ZodError 처리
  if (err instanceof ZodError) {
    const message = err.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    res.status(400).json({ error: message });
    return;
  }

  log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: ERROR_CODES.SERVER_ERROR });
}
