import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

describe('Inquiries E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
  });

  describe('POST /api/inquiries', () => {
    const validBody = {
      category: 'GENERAL',
      title: '문의드립니다',
      content: '서비스 이용 관련 문의입니다.',
    };

    it('비인증도 접수 가능 → 201', async () => {
      prismaMock.inquiry.create.mockResolvedValue({
        id: 'inq-1',
        status: 'OPEN',
        createdAt: new Date('2026-01-01'),
      });

      const res = await app.post('/api/inquiries').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 'inq-1');
      expect(res.body).toHaveProperty('status', 'OPEN');
    });

    it('인증 시 userId 연결', async () => {
      prismaMock.inquiry.create.mockResolvedValue({
        id: 'inq-2',
        status: 'OPEN',
        createdAt: new Date(),
      });

      const res = await app
        .post('/api/inquiries')
        .set('Authorization', authHeader())
        .send(validBody);

      expect(res.status).toBe(201);
      expect(prismaMock.inquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'test-user-id' }),
        }),
      );
    });

    it('title 누락 → 400', async () => {
      const res = await app
        .post('/api/inquiries')
        .send({ category: 'GENERAL', content: '내용만' });
      expect(res.status).toBe(400);
    });

    it('content 누락 → 400', async () => {
      const res = await app
        .post('/api/inquiries')
        .send({ category: 'GENERAL', title: '제목만' });
      expect(res.status).toBe(400);
    });

    it('잘못된 category → 400', async () => {
      const res = await app
        .post('/api/inquiries')
        .send({ category: 'INVALID', title: '제목', content: '내용' });
      expect(res.status).toBe(400);
    });
  });
});
