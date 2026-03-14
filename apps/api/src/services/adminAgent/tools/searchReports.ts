import type { Prisma } from '@prisma/client';
import { prisma } from '../../../db/client.js';
import type { ReportStatus, SubjectType } from '@findthem/shared';

export interface SearchReportsInput {
  status?: ReportStatus;
  subjectType?: SubjectType;
  query?: string;
  limit?: number;
}

export async function searchReports(input: SearchReportsInput): Promise<unknown> {
  const limit = Math.min(input.limit ?? 10, 50);

  const where: Prisma.ReportWhereInput = {};

  if (input.status) {
    where.status = input.status;
  }
  if (input.subjectType) {
    where.subjectType = input.subjectType;
  }
  if (input.query) {
    where.OR = [
      { name: { contains: input.query, mode: 'insensitive' } },
      { features: { contains: input.query, mode: 'insensitive' } },
      { lastSeenAddress: { contains: input.query, mode: 'insensitive' } },
      { contactName: { contains: input.query, mode: 'insensitive' } },
      { contactPhone: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      select: {
        id: true,
        subjectType: true,
        status: true,
        name: true,
        features: true,
        lastSeenAt: true,
        lastSeenAddress: true,
        contactPhone: true,
        contactName: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true } },
        _count: { select: { sightings: true, matches: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);

  return {
    reports: reports.map((r) => ({
      ...r,
      lastSeenAt: r.lastSeenAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    returned: reports.length,
  };
}
