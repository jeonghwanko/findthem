import { Prisma } from '@prisma/client';
import { prisma } from '../../../db/client.js';

export interface SearchUsersInput {
  query?: string;
  isBlocked?: boolean;
  limit?: number;
}

export async function searchUsers(input: SearchUsersInput): Promise<unknown> {
  const limit = Math.min(input.limit ?? 10, 50);

  const where: Prisma.UserWhereInput = {};

  if (input.isBlocked !== undefined) {
    where.isBlocked = input.isBlocked;
  }
  if (input.query) {
    where.OR = [
      { name: { contains: input.query, mode: 'insensitive' } },
      { phone: { contains: input.query } },
      { email: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        provider: true,
        isVerified: true,
        isBlocked: true,
        blockedAt: true,
        blockReason: true,
        createdAt: true,
        _count: { select: { reports: true, sightings: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({
      ...u,
      blockedAt: u.blockedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    returned: users.length,
  };
}
