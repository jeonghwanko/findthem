import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from './errors.js';
import { ERROR_CODES } from '@findthem/shared';

function buildDetails(errors: { path: (string | number)[]; message: string }[]): string {
  return errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, buildDetails(result.error.errors));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, buildDetails(result.error.errors));
    }
    req.query = result.data;
    next();
  };
}
