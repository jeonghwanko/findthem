import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { validateQuery } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { ERROR_CODES } from '@findthem/shared';

const matchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerMatchRoutes(router: Router) {
  // 내 신고에 대한 매칭 결과 조회
  router.get('/reports/:id/matches', requireAuth, validateQuery(matchesQuerySchema), async (req, res) => {
    const id = req.params.id as string;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!; // requireAuth가 보장
    const { page, limit } = req.query as unknown as z.infer<typeof matchesQuerySchema>;

    const report = await prisma.report.findUnique({
      where: { id },
    });
    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
    if (report.userId !== userId) {
      throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);
    }

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where: { reportId: id },
        include: {
          sighting: { include: { photos: true } },
        },
        orderBy: { confidence: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.match.count({ where: { reportId: id } }),
    ]);

    res.json({ matches, total, page, totalPages: Math.ceil(total / limit) });
  });

  // 매칭 결과 확인/거부
  router.patch('/matches/:id', requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const { status } = z
      .object({ status: z.enum(['CONFIRMED', 'REJECTED']) })
      .parse(req.body);

    const match = await prisma.match.findUnique({
      where: { id },
      include: { report: true },
    });

    if (!match) throw new ApiError(404, ERROR_CODES.MATCH_NOT_FOUND);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId: matchUserId } = req.user!; // requireAuth가 보장
    if (match.report.userId !== matchUserId) {
      throw new ApiError(403, ERROR_CODES.MATCH_OWNER_ONLY);
    }

    const updated = await prisma.match.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });

    res.json(updated);
  });
}
