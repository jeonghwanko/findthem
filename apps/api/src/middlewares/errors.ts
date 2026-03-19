import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError, ERROR_CODES } from '@findthem/shared';
import { createLogger } from '../logger.js';

export { ApiError } from '@findthem/shared';

const log = createLogger('errors');

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // 라우트에서 z.parse()로 직접 검증할 때 발생하는 ZodError 처리
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    res.status(400).json({ error: ERROR_CODES.VALIDATION_ERROR, details });
    return;
  }

  log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: ERROR_CODES.SERVER_ERROR });
}
