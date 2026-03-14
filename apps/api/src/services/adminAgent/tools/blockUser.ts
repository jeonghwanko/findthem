import { prisma } from '../../../db/client.js';
import { ApiError } from '../../../middlewares/errors.js';

export interface BlockUserInput {
  userId: string;
  blocked: boolean;
  reason?: string;
}

export async function blockUser(input: BlockUserInput): Promise<unknown> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, phone: true, isBlocked: true, blockReason: true },
  });

  if (!user) {
    throw new ApiError(404, `사용자를 찾을 수 없습니다: ${input.userId}`);
  }

  if (user.isBlocked === input.blocked) {
    const stateLabel = input.blocked ? '차단' : '정상';
    return {
      success: false,
      message: `이미 ${stateLabel} 상태입니다.`,
      user: { id: user.id, name: user.name, isBlocked: user.isBlocked },
    };
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: {
      isBlocked: input.blocked,
      blockedAt: input.blocked ? new Date() : null,
      blockReason: input.blocked ? (input.reason ?? null) : null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      isBlocked: true,
      blockedAt: true,
      blockReason: true,
      updatedAt: true,
    },
  });

  const action = input.blocked ? '차단' : '차단 해제';
  return {
    success: true,
    message: `사용자 ${user.name}(${user.phone})을(를) ${action}했습니다.`,
    reason: input.reason ?? null,
    user: {
      ...updated,
      blockedAt: updated.blockedAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}
