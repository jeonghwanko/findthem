import type { Router } from 'express';
import { prisma } from '../db/client.js';

export function registerOutreachRoutes(router: Router) {
  // 공개 엔드포인트 — 인증 불필요
  // SENT/APPROVED 아웃리치 중 videoId 있는 것 최대 10개 반환
  router.get('/outreach/highlights', async (req, res) => {
    const requests = await prisma.outreachRequest.findMany({
      where: {
        status: { in: ['SENT', 'APPROVED'] },
        contact: { videoId: { not: null } },
      },
      select: {
        reportId: true,
        contact: {
          select: {
            name: true,
            videoId: true,
            videoTitle: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const items = requests
      .filter((r): r is typeof r & { contact: { videoId: string } } =>
        r.contact.videoId !== null,
      )
      .map((r) => ({
        videoId: r.contact.videoId,
        videoTitle: r.contact.videoTitle ?? r.contact.name,
        channelName: r.contact.name,
        reportId: r.reportId,
      }));

    res.json({ items });
  });
}
