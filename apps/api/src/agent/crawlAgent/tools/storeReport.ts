import type { Prisma } from '@prisma/client';
import { prisma } from '../../../db/client.js';
import { createLogger } from '../../../logger.js';
import type { SubjectType, Gender } from '@findthem/shared';

const log = createLogger('crawlAgent:storeReport');

interface StoreReportInput {
  externalId: string;
  externalSource: string;
  subjectType: SubjectType;
  name: string;
  features: string;
  lastSeenAt: string;
  lastSeenAddress: string;
  photoUrl?: string;
  contactPhone?: string;
  contactName?: string;
  gender?: Gender;
  age?: string;
  color?: string;
  weight?: string;
  species?: string;
}

interface StoreReportResult {
  reportId: string | null;
  created: boolean;
  reason?: string;
}

export async function storeReport(input: unknown): Promise<StoreReportResult> {
  const data = input as StoreReportInput;

  try {
    const report = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.report.create({
        data: {
          userId: null,
          subjectType: data.subjectType,
          status: 'ACTIVE',
          name: data.name,
          features: data.features,
          lastSeenAt: new Date(data.lastSeenAt),
          lastSeenAddress: data.lastSeenAddress,
          contactPhone: data.contactPhone ?? '정보 없음',
          contactName: data.contactName ?? data.externalSource,
          gender: data.gender,
          age: data.age,
          color: data.color,
          weight: data.weight,
          species: data.species,
          externalId: data.externalId,
          externalSource: data.externalSource,
        },
      });

      if (data.photoUrl) {
        await tx.reportPhoto.create({
          data: {
            reportId: created.id,
            photoUrl: data.photoUrl,
            isPrimary: true,
          },
        });
      }

      return created;
    });

    return { reportId: report.id, created: true };
  } catch (err) {
    // Prisma unique constraint violation (P2002) — duplicate
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      log.warn({ externalId: data.externalId, externalSource: data.externalSource }, 'store_report: duplicate, skipping');
      return { reportId: null, created: false, reason: 'duplicate' };
    }

    log.error({ err, externalId: data.externalId }, 'store_report failed');
    return { reportId: null, created: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
