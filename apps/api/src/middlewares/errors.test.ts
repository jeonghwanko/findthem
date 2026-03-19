import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError, errorHandler } from './errors.js';

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('ApiError', () => {
  it('statusCode와 message가 올바르게 설정된다', () => {
    const err = new ApiError(404, '찾을 수 없습니다.');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('찾을 수 없습니다.');
    expect(err.name).toBe('ApiError');
  });

  it('Error를 상속한다', () => {
    const err = new ApiError(400, '잘못된 요청');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('errorHandler', () => {
  it('ApiError → 해당 statusCode로 응답', () => {
    const err = new ApiError(409, '중복된 데이터');
    const res = createMockRes();

    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: '중복된 데이터' });
  });

  it('ZodError → 400으로 응답', () => {
    const schema = z.object({ name: z.string().min(1) });
    let zodErr: Error;
    try {
      schema.parse({ name: '' });
    } catch (err) {
      zodErr = err as Error;
    }
    const res = createMockRes();

    errorHandler(zodErr!, {} as Request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'VALIDATION_ERROR',
        details: expect.stringContaining('name'),
      }),
    );
  });

  it('일반 Error → 500으로 응답', () => {
    const err = new Error('알 수 없는 오류');
    const res = createMockRes();

    // console.error 무시
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'SERVER_ERROR' });

    consoleError.mockRestore();
  });
});
