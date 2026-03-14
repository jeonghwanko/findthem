import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';

export function registerMatchRoutes(router: Router) {
  // 내 신고에 대한 매칭 결과 조회
  router.get('/reports/:id/matches', requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const report = await prisma.report.findUnique({
      where: { id },
    });
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
    if (report.userId !== req.user!.userId) {
      throw new ApiError(403, 'REPORT_OWNER_ONLY');
    }

    const matches = await prisma.match.findMany({
      where: { reportId: id },
      include: {
        sighting: { include: { photos: true } },
      },
      orderBy: { confidence: 'desc' },
    });

    res.json(matches);
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

    if (!match) throw new ApiError(404, 'MATCH_NOT_FOUND');
    if (match.report.userId !== req.user!.userId) {
      throw new ApiError(403, 'MATCH_OWNER_ONLY');
    }

    const updated = await prisma.match.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });

    res.json(updated);
  });
}
