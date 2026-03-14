import type { SubjectType } from '@findthem/shared';
import { prisma } from '../../db/client.js';

export interface SearchReportItem {
  id: string;
  name: string;
  subjectType: SubjectType;
  features: string;
  lastSeenAddress: string;
  photoUrl?: string;
}

export interface SearchReportsResult {
  reports: SearchReportItem[];
}

export async function searchReports(
  subjectType: SubjectType,
  description?: string,
  address?: string,
  limit = 5,
): Promise<SearchReportsResult> {
  const take = Math.min(limit, 20);

  const reports = await prisma.report.findMany({
    where: {
      status: 'ACTIVE',
      subjectType,
    },
    include: {
      photos: {
        where: { isPrimary: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  const items: SearchReportItem[] = reports.map((r) => ({
    id: r.id,
    name: r.name,
    subjectType: r.subjectType as SubjectType,
    features: r.features,
    lastSeenAddress: r.lastSeenAddress,
    photoUrl: r.photos[0]?.photoUrl ?? undefined,
  }));

  // description이나 address가 있으면 관련성 높은 것을 앞으로 정렬
  if (description || address) {
    const keyword = `${description ?? ''} ${address ?? ''}`.toLowerCase();
    items.sort((a, b) => {
      const aScore = scoreRelevance(a, keyword);
      const bScore = scoreRelevance(b, keyword);
      return bScore - aScore;
    });
  }

  return { reports: items };
}

function scoreRelevance(report: SearchReportItem, keyword: string): number {
  let score = 0;
  const combined = `${report.features} ${report.lastSeenAddress}`.toLowerCase();
  const words = keyword.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (combined.includes(word)) score++;
  }
  return score;
}
