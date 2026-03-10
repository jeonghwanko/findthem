import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validateBody, validateQuery } from './validate.js';
import { ApiError } from './errors.js';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    ...overrides,
  } as Request;
}

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });

  it('유효한 body → next() 호출', () => {
    const req = createMockReq({ body: { name: '홍길동', age: 25 } });
    const next = vi.fn();

    validateBody(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: '홍길동', age: 25 });
  });

  it('무효한 body → ApiError(400) throw', () => {
    const req = createMockReq({ body: { name: '', age: -1 } });
    const next = vi.fn();

    expect(() => {
      validateBody(schema)(req, {} as Response, next);
    }).toThrow(ApiError);

    try {
      validateBody(schema)(req, {} as Response, next);
    } catch (err) {
      expect((err as ApiError).statusCode).toBe(400);
    }
  });

  it('body가 비어있으면 에러', () => {
    const req = createMockReq({ body: {} });
    const next = vi.fn();

    expect(() => {
      validateBody(schema)(req, {} as Response, next);
    }).toThrow(ApiError);
  });
});

describe('validateQuery', () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  it('유효한 query → next() 호출', () => {
    const req = createMockReq({ query: { page: '2', limit: '10' } as any });
    const next = vi.fn();

    validateQuery(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.query).toEqual({ page: 2, limit: 10 });
  });

  it('기본값 적용', () => {
    const req = createMockReq({ query: {} as any });
    const next = vi.fn();

    validateQuery(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.query).toEqual({ page: 1, limit: 20 });
  });

  it('무효한 query → ApiError(400) throw', () => {
    const req = createMockReq({ query: { page: '0', limit: '100' } as any });
    const next = vi.fn();

    expect(() => {
      validateQuery(schema)(req, {} as Response, next);
    }).toThrow(ApiError);
  });
});
