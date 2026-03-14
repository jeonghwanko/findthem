import { prisma } from '../../../db/client.js';
import { ApiError, ERROR_CODES } from '@findthem/shared';

export interface UpdateMatchStatusInput {
  matchId: string;
  newStatus: 'CONFIRMED' | 'REJECTED';
  reason?: string;
}

export async function updateMatchStatus(input: UpdateMatchStatusInput): Promise<unknown> {
  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    select: {
      id: true,
      status: true,
      confidence: true,
      aiReasoning: true,
      reportId: true,
      sightingId: true,
    },
  });

  if (!match) {
    throw new ApiError(404, ERROR_CODES.MATCH_NOT_FOUND);
  }

  if (match.status === input.newStatus) {
    return {
      success: false,
      message: `이미 ${input.newStatus} 상태입니다.`,
      match: { id: match.id, status: match.status },
    };
  }

  const updated = await prisma.match.update({
    where: { id: input.matchId },
    data: {
      status: input.newStatus,
      reviewedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      confidence: true,
      reportId: true,
      sightingId: true,
      reviewedAt: true,
    },
  });

  return {
    success: true,
    message: `매칭 상태를 ${match.status} → ${input.newStatus}로 변경했습니다.`,
    reason: input.reason ?? null,
    match: {
      ...updated,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    },
  };
}
