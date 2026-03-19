import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { validateBody } from '../middlewares/validate.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { ERROR_CODES, INQUIRY_CATEGORY_VALUES } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('inquiriesRoutes');

// 15분에 5회
const inquiryLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });

const createInquirySchema = z.object({
  category: z.enum(INQUIRY_CATEGORY_VALUES),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
});

export function registerInquiryRoutes(router: Router) {
  // POST /inquiries — 문의 접수 (optionalAuth)
  router.post(
    '/inquiries',
    inquiryLimiter,
    optionalAuth,
    validateBody(createInquirySchema),
    async (req, res) => {
      const { category, title, content } = req.body as z.infer<typeof createInquirySchema>;
      const userId = req.user?.userId ?? null;

      const inquiry = await prisma.inquiry.create({
        data: {
          userId,
          category,
          title,
          content,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      });

      log.info({ inquiryId: inquiry.id, category, userId }, 'Inquiry created');

      res.status(201).json({
        id: inquiry.id,
        status: inquiry.status,
        createdAt: inquiry.createdAt.toISOString(),
      });
    },
  );
}
