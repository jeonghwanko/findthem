import { prisma } from '../../../db/client.js';

interface SearchReportsInput {
  externalIds: string[];
  externalSource: string;
}

interface SearchReportsResult {
  existingIds: string[];
  duplicateRate: number;
}

export async function searchReports(input: unknown): Promise<SearchReportsResult> {
  const { externalIds, externalSource } = input as SearchReportsInput;

  const existing = await prisma.report.findMany({
    where: {
      externalId: { in: externalIds },
      externalSource,
    },
    select: { externalId: true },
  });

  const existingIds = existing
    .map((r) => r.externalId)
    .filter((id): id is string => id !== null);

  const duplicateRate = externalIds.length > 0 ? existingIds.length / externalIds.length : 0;

  return { existingIds, duplicateRate };
}
