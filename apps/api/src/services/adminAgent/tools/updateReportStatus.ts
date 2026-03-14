import { prisma } from '../../../db/client.js';
import { ApiError } from '../../../middlewares/errors.js';

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
    throw new ApiError(404, `신고를 찾을 수 없습니다: ${input.reportId}`);
  }

  if (report.status === input.newStatus) {
    return {
      success: false,
      message: `이미 ${input.newStatus} 상태입니다.`,
      report: { id: report.id, name: report.name, status: report.status },
    };
  }

  const updated = await prisma.report.update({
    where: { id: input.reportId },
    data: { status: input.newStatus },
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
