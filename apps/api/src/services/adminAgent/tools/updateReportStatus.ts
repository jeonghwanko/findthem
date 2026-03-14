import { prisma } from '../../../db/client.js';
import { ApiError, ERROR_CODES } from '@findthem/shared';

export interface UpdateReportStatusInput {
  reportId: string;
  newStatus: 'ACTIVE' | 'SUSPENDED';
  reason: string;
}

export async function updateReportStatus(input: UpdateReportStatusInput): Promise<unknown> {
  const report = await prisma.report.findUnique({
    where: { id: input.reportId },
    select: { id: true, status: true, name: true, subjectType: true },
  });

  if (!report) {
    throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
  }

  if (report.status === input.newStatus) {
    return {
      success: false,
      message: `이미 ${input.newStatus} 상태입니다.`,
      report: { id: report.id, name: report.name, status: report.status },
    };
  }

  // RACE-10: 조건부 update — EXPIRED/SUSPENDED는 관리자 에이전트도 임의 변경 불가
  // updateMany로 원자적 처리 후 count === 0이면 상태 충돌 에러
  const updateResult = await prisma.report.updateMany({
    where: { id: input.reportId, status: { notIn: ['EXPIRED', 'SUSPENDED'] } },
    data: { status: input.newStatus },
  });

  if (updateResult.count === 0) {
    throw new ApiError(409, ERROR_CODES.REPORT_STATUS_CONFLICT);
  }

  const updated = await prisma.report.findUniqueOrThrow({
    where: { id: input.reportId },
    select: { id: true, status: true, name: true, subjectType: true, updatedAt: true },
  });

  return {
    success: true,
    message: `신고 상태를 ${report.status} → ${input.newStatus}로 변경했습니다.`,
    reason: input.reason,
    report: {
      ...updated,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}
