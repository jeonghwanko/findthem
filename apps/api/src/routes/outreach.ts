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
        contact: {
          type: { in: ['YOUTUBER', 'VIDEO'] },
          OR: [{ videoId: { not: null } }, { youtubeChannelId: { not: null } }],
        },
      },
      select: {
        reportId: true,
        status: true,
        contact: {
          select: {
            name: true,
            type: true,
            videoId: true,
            videoTitle: true,
            viewCount: true,
            youtubeChannelId: true,
            youtubeChannelUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // 채널별 중복 제거 (같은 채널이 여러 신고에 연결될 수 있음)
    const seen = new Set<string>();
    const items = requests
      .filter((r) => {
        const key = r.contact.videoId ?? r.contact.youtubeChannelId;
        if (!key) return false;
        if (r.contact.videoId && !YT_VIDEO_ID_RE.test(r.contact.videoId)) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({
        videoId: r.contact.videoId ?? null,
        channelId: r.contact.youtubeChannelId ?? null,
        channelUrl: r.contact.youtubeChannelUrl ?? null,
        videoTitle: r.contact.videoTitle ?? r.contact.name,
        channelName: r.contact.name,
        reportId: r.reportId,
        viewCount: r.contact.viewCount,
        status: r.status,
      }));

    res.json({ items });
  });
}
