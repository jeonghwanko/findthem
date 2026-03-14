import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminActionSource } from '@findthem/shared';
import { createAuditLog, listAuditLogs } from './auditLogService.js';

// setup.ts에서 전역으로 vi.mock('../src/db/client.js')이 등록되어 있음
// 여기서 prisma 모듈을 import하면 setup.ts mock 객체를 가져온다
import { prisma } from '../db/client.js';

// adminAuditLog mock은 setup.ts의 prismaMock에 포함되어 있음
const auditLogMock = (prisma as any).adminAuditLog;

describe('createAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prisma.adminAuditLog.create를 호출한다', async () => {
    const mockRecord = {
      id: 'audit-1',
      action: 'REPORT_SUSPEND',
      targetType: 'Report',
      targetId: 'report-123',
      detail: null,
      source: 'AGENT',
      agentSessionId: null,
      createdAt: new Date(),
    };
    auditLogMock.create.mockResolvedValue(mockRecord);

    await createAuditLog({
      action: 'REPORT_SUSPEND',
      targetType: 'Report',
      targetId: 'report-123',
      source: 'AGENT',
    });

    expect(auditLogMock.create).toHaveBeenCalledOnce();
  });

  it('모든 필드를 올바르게 전달한다', async () => {
    auditLogMock.create.mockResolvedValue({} as any);

    await createAuditLog({
      action: 'USER_BLOCK',
      targetType: 'User',
      targetId: 'user-456',
      detail: { reason: '스팸' },
      source: 'ADMIN' as AdminActionSource,
      agentSessionId: 'session-789',
    });

    expect(auditLogMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_BLOCK',
          targetType: 'User',
          targetId: 'user-456',
          source: 'ADMIN',
          agentSessionId: 'session-789',
        }),
      }),
    );
  });

  it('detail이 없으면 Prisma.JsonNull로 전달된다', async () => {
    auditLogMock.create.mockResolvedValue({} as any);

    await createAuditLog({
      action: 'REPORT_ACTIVATE',
      targetType: 'Report',
      targetId: 'report-001',
      source: 'ADMIN' as AdminActionSource,
    });

    const callArg = auditLogMock.create.mock.calls[0][0];
    // Prisma.JsonNull은 Symbol이므로 undefined가 아님을 확인
    expect(callArg.data.detail).not.toBeUndefined();
  });

  it('create의 반환값을 그대로 반환한다', async () => {
    const mockRecord = { id: 'audit-42', action: 'TEST' };
    auditLogMock.create.mockResolvedValue(mockRecord);

    const result = await createAuditLog({
      action: 'TEST',
      targetType: 'Report',
      targetId: 'r-1',
      source: 'AGENT',
    });

    expect(result).toBe(mockRecord);
  });
});

describe('listAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLogs = [
    { id: 'a1', action: 'REPORT_SUSPEND', createdAt: new Date() },
    { id: 'a2', action: 'USER_BLOCK', createdAt: new Date() },
  ];

  it('items, total, page, totalPages를 포함한 객체를 반환한다', async () => {
    auditLogMock.findMany.mockResolvedValue(mockLogs);
    auditLogMock.count.mockResolvedValue(2);

    const result = await listAuditLogs({});

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total', 2);
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('totalPages');
  });

  it('기본 page=1, limit=20으로 동작한다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(0);

    await listAuditLogs({});

    expect(auditLogMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('page=2이면 skip이 limit만큼 이동한다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(40);

    await listAuditLogs({ page: 2, limit: 10 });

    expect(auditLogMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('limit이 50을 초과하면 50으로 제한된다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(0);

    await listAuditLogs({ limit: 100 });

    expect(auditLogMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('totalPages가 올바르게 계산된다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(55);

    const result = await listAuditLogs({ limit: 20 });

    // ceil(55/20) = 3
    expect(result.totalPages).toBe(3);
  });

  it('targetType 필터가 where 조건에 전달된다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(0);

    await listAuditLogs({ targetType: 'Report' });

    expect(auditLogMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetType: 'Report' }),
      }),
    );
  });

  it('source 필터가 where 조건에 전달된다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(0);

    await listAuditLogs({ source: 'ADMIN' as AdminActionSource });

    expect(auditLogMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'ADMIN' }),
      }),
    );
  });

  it('from/to 필터가 createdAt 범위로 전달된다', async () => {
    auditLogMock.findMany.mockResolvedValue([]);
    auditLogMock.count.mockResolvedValue(0);

    await listAuditLogs({ from: '2025-01-01', to: '2025-12-31' });

    const callArg = auditLogMock.findMany.mock.calls[0][0];
    expect(callArg.where.createdAt).toEqual({
      gte: new Date('2025-01-01'),
      lte: new Date('2025-12-31'),
    });
  });

  it('findMany와 count를 동시에 호출한다', async () => {
    auditLogMock.findMany.mockResolvedValue(mockLogs);
    auditLogMock.count.mockResolvedValue(2);

    await listAuditLogs({});

    expect(auditLogMock.findMany).toHaveBeenCalledOnce();
    expect(auditLogMock.count).toHaveBeenCalledOnce();
  });
});
