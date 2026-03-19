import type { SubjectType } from '@findthem/shared';
import { prisma } from '../../db/client.js';
import { imageQueue } from '../../jobs/queues.js';

export interface SaveSightingInput {
  subjectType: SubjectType;
  description: string;
  address: string;
  sightedAt: string;
  lat?: number | null;
  lng?: number | null;
  photoUrls?: string[];
  tipsterName?: string | null;
  tipsterPhone?: string | null;
  reportId?: string | null;
  userId?: string;
}

export interface SaveSightingResult {
  sightingId: string;
  message: string;
}

export async function saveSighting(input: SaveSightingInput): Promise<SaveSightingResult> {
  const sighting = await prisma.sighting.create({
    data: {
      reportId: input.reportId ?? null,
      userId: input.userId ?? null,
      subjectType: input.subjectType,
      description: input.description,
      address: input.address,
      sightedAt: new Date(input.sightedAt),
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      tipsterName: input.tipsterName ?? null,
      tipsterPhone: input.tipsterPhone ?? null,
      source: 'WEB',
      status: 'PENDING',
      photos:
        input.photoUrls && input.photoUrls.length > 0
          ? {
              create: input.photoUrls.map((url) => ({
                photoUrl: url,
              })),
            }
          : undefined,
    },
  });

  // 사진이 있으면 이미지 처리 큐 등록 (완료 후 imageProcessingJob이 matchingQueue 등록)
  if (input.photoUrls && input.photoUrls.length > 0) {
    await imageQueue.add(
      'process-sighting-photos',
      { type: 'sighting', sightingId: sighting.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, jobId: `image-sighting-${sighting.id}` },
    );
  }

  return { sightingId: sighting.id, message: '제보가 저장되었습니다' };
}
