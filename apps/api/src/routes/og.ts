import type { Router } from 'express';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('og');

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOgHtml(opts: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
}): string {
  const { title, description, imageUrl, pageUrl } = opts;
  const t = escHtml(title);
  const d = escHtml(description);
  const img = escHtml(imageUrl);
  const url = escHtml(pageUrl);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta property="og:title" content="${t}"/>
<meta property="og:description" content="${d}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:type" content="article"/>
<meta property="og:site_name" content="YooNion - FindThem"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${t}"/>
<meta name="twitter:description" content="${d}"/>
<meta name="twitter:image" content="${img}"/>
<meta http-equiv="refresh" content="0;url=${url}"/>
</head>
<body></body>
</html>`;
}

const SUBJECT_LABEL: Record<string, string> = {
  PERSON: '실종자',
  DOG: '실종견',
  CAT: '실종묘',
};

const STATUS_PREFIX: Record<string, string> = {
  ACTIVE: '실종',
  FOUND: '찾았습니다',
  EXPIRED: '만료',
  SUSPENDED: '중단',
};

const MAX_DESC_LENGTH = 200;

export function registerOgRoutes(router: Router) {
  router.get('/og/reports/:id', async (req, res) => {
    try {
      const report = await prisma.report.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          name: true,
          subjectType: true,
          features: true,
          status: true,
          lastSeenAddress: true,
          photos: {
            where: { isPrimary: true },
            take: 1,
            select: { photoUrl: true },
          },
        },
      });

      if (!report) {
        res.status(404).send('Not Found');
        return;
      }

      const photoUrl = report.photos[0]?.photoUrl;
      const fullPhotoUrl = photoUrl
        ? `${config.siteUrl}${photoUrl.startsWith('/') ? photoUrl : `/uploads/${photoUrl}`}`
        : `${config.siteUrl}/pwa-512x512.png`;

      const pageUrl = `${config.siteUrl}/reports/${report.id}`;
      const subjectLabel = SUBJECT_LABEL[report.subjectType] ?? '실종';
      const statusPrefix = STATUS_PREFIX[report.status] ?? '실종';
      const title = report.status === 'FOUND'
        ? `[찾았습니다] ${report.name}`
        : `[${subjectLabel}] ${report.name}`;

      const rawDesc = [report.features, report.lastSeenAddress]
        .filter(Boolean)
        .join(' | ');
      const description = rawDesc.length > MAX_DESC_LENGTH
        ? rawDesc.slice(0, MAX_DESC_LENGTH - 1) + '…'
        : rawDesc;

      log.info({ reportId: report.id, status: statusPrefix }, 'OG meta served');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buildOgHtml({ title, description, imageUrl: fullPhotoUrl, pageUrl }));
    } catch (err) {
      log.error({ err, reportId: req.params.id }, 'OG meta generation failed');
      res.status(500).send('Internal Server Error');
    }
  });
}
