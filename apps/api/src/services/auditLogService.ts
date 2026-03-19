import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type AdminActionSource } from '@findthem/shared';

export interface CreateAuditLogParams {
  action: string;
  targetType: string;
  targetId: string;
  detail?: unknown;
  source: AdminActionSource;
  agentSessionId?: string;
}

export async function createAuditLog(params: CreateAuditLogParams) {
  return prisma.adminAuditLog.create({
    data: {
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      detail: params.detail !== undefined
        ? (params.detail as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      source: params.source,
      agentSessionId: params.agentSessionId,
    },
  });
}

export interface ListAuditLogsOptions {
  page?: number;
  limit?: number;
  targetType?: string;
  source?: AdminActionSource;
  from?: string;
  to?: string;
}

export async function listAuditLogs(options: ListAuditLogsOptions) {
  const page = options.page ?? 1;
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;

  const where: Prisma.AdminAuditLogWhereInput = {};

  if (options.targetType) {
    where.targetType = options.targetType;
  }
  if (options.source) {
    where.source = options.source;
  }
  if (options.from !== undefined || options.to !== undefined) {
    where.createdAt = {
      ...(options.from ? { gte: new Date(options.from) } : {}),
      ...(options.to ? { lte: new Date(options.to) } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return {
    items: logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
