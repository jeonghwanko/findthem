import type { Router } from 'express';
import { prisma } from '../db/client.js';
import { YT_VIDEO_ID_RE } from '@findthem/shared';

export function registerOutreachRoutes(router: Router) {
  // 공개 엔드포인트 — 인증 불필요
  // 대기 중(PENDING_APPROVAL) 아웃리치 중 videoId 있는 것 최대 20개 반환
  // + SENT 상태도 포함 (발송 완료된 것도 보여줌)
  router.get('/outreach/highlights', async (_req, res) => {
    const requests = await prisma.outreachRequest.findMany({
      where: {
        status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SENT'] },
        contact: { videoId: { not: null } },
      },
      select: {
        reportId: true,
        status: true,
        contact: {
          select: {
            name: true,
            videoId: true,
            videoTitle: true,
            viewCount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const items = requests
      .filter((r): r is typeof r & { contact: { videoId: string } } =>
        r.contact.videoId !== null && YT_VIDEO_ID_RE.test(r.contact.videoId),
      )
      .map((r) => ({
        videoId: r.contact.videoId,
        videoTitle: r.contact.videoTitle ?? r.contact.name,
        channelName: r.contact.name,
        reportId: r.reportId,
        viewCount: r.contact.viewCount,
        status: r.status,
      }));

    res.json({ items });
  });
}
