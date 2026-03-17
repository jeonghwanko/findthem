import { Prisma } from '@prisma/client';
import { prisma } from '../../../db/client.js';

type Entity = 'reports' | 'sightings' | 'matches' | 'users';
type Period = 'today' | 'week' | 'month' | 'all';
type GroupBy = 'status' | 'subjectType' | 'source' | 'day' | 'none';

export interface QueryStatsInput {
  entity: Entity;
  period: Period;
  groupBy: GroupBy;
}

function periodStart(period: Period): Date | undefined {
  if (period === 'all') return undefined;
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'today') return d;
  if (period === 'week') {
    d.setUTCDate(d.getUTCDate() - 7);
    return d;
  }
  if (period === 'month') {
    d.setUTCDate(d.getUTCDate() - 30);
    return d;
  }
  return undefined;
}

async function queryReports(since: Date | undefined, groupBy: GroupBy) {
  const where: Prisma.ReportWhereInput = since ? { createdAt: { gte: since } } : {};

  if (groupBy === 'none') {
    const count = await prisma.report.count({ where });
    return { total: count };
  }
  if (groupBy === 'status') {
    const rows = await prisma.report.groupBy({ by: ['status'], where, _count: true });
    return rows.map((r) => ({ status: r.status, count: r._count }));
  }
  if (groupBy === 'subjectType') {
    const rows = await prisma.report.groupBy({ by: ['subjectType'], where, _count: true });
    return rows.map((r) => ({ subjectType: r.subjectType, count: r._count }));
  }
  if (groupBy === 'day') {
    const result = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS date, COUNT(*)::bigint AS count
      FROM "report"
      ${since ? Prisma.sql`WHERE created_at >= ${since}` : Prisma.sql``}
      GROUP BY date
      ORDER BY date
    `;
    return result.map((r) => ({ date: r.date.toISOString().split('T')[0], count: Number(r.count) }));
  }
  const count = await prisma.report.count({ where });
  return { total: count };
}

async function querySightings(since: Date | undefined, groupBy: GroupBy) {
  const where: Prisma.SightingWhereInput = since ? { createdAt: { gte: since } } : {};

  if (groupBy === 'none') {
    const count = await prisma.sighting.count({ where });
    return { total: count };
  }
  if (groupBy === 'status') {
    const rows = await prisma.sighting.groupBy({ by: ['status'], where, _count: true });
    return rows.map((r) => ({ status: r.status, count: r._count }));
  }
  if (groupBy === 'source') {
    const rows = await prisma.sighting.groupBy({ by: ['source'], where, _count: true });
    return rows.map((r) => ({ source: r.source, count: r._count }));
  }
  if (groupBy === 'subjectType') {
    const rows = await prisma.sighting.groupBy({ by: ['subjectType'], where, _count: true });
    return rows.map((r) => ({ subjectType: r.subjectType, count: r._count }));
  }
  if (groupBy === 'day') {
    const result = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS date, COUNT(*)::bigint AS count
      FROM "sighting"
      ${since ? Prisma.sql`WHERE created_at >= ${since}` : Prisma.sql``}
      GROUP BY date
      ORDER BY date
    `;
    return result.map((r) => ({ date: r.date.toISOString().split('T')[0], count: Number(r.count) }));
  }
  const count = await prisma.sighting.count({ where });
  return { total: count };
}

async function queryMatches(since: Date | undefined, groupBy: GroupBy) {
  const where: Prisma.MatchWhereInput = since ? { createdAt: { gte: since } } : {};

  if (groupBy === 'none') {
    const [count, avgConf] = await Promise.all([
      prisma.match.count({ where }),
      prisma.match.aggregate({ where, _avg: { confidence: true } }),
    ]);
    return { total: count, avgConfidence: avgConf._avg.confidence ?? 0 };
  }
  if (groupBy === 'status') {
    const rows = await prisma.match.groupBy({ by: ['status'], where, _count: true });
    return rows.map((r) => ({ status: r.status, count: r._count }));
  }
  if (groupBy === 'day') {
    const result = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS date, COUNT(*)::bigint AS count
      FROM "match"
      ${since ? Prisma.sql`WHERE created_at >= ${since}` : Prisma.sql``}
      GROUP BY date
      ORDER BY date
    `;
    return result.map((r) => ({ date: r.date.toISOString().split('T')[0], count: Number(r.count) }));
  }
  const count = await prisma.match.count({ where });
  return { total: count };
}

async function queryUsers(since: Date | undefined, groupBy: GroupBy) {
  const where: Prisma.UserWhereInput = since ? { createdAt: { gte: since } } : {};

  if (groupBy === 'none') {
    const [total, blocked] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...where, isBlocked: true } }),
    ]);
    return { total, blocked };
  }
  if (groupBy === 'day') {
    const result = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS date, COUNT(*)::bigint AS count
      FROM "user"
      ${since ? Prisma.sql`WHERE created_at >= ${since}` : Prisma.sql``}
      GROUP BY date
      ORDER BY date
    `;
    return result.map((r) => ({ date: r.date.toISOString().split('T')[0], count: Number(r.count) }));
  }
  const count = await prisma.user.count({ where });
  return { total: count };
}

export async function queryStats(input: QueryStatsInput): Promise<unknown> {
  const since = periodStart(input.period);

  switch (input.entity) {
    case 'reports':
      return queryReports(since, input.groupBy);
    case 'sightings':
      return querySightings(since, input.groupBy);
    case 'matches':
      return queryMatches(since, input.groupBy);
    case 'users':
      return queryUsers(since, input.groupBy);
    default:
      return { error: `Unknown entity: ${input.entity}` };
  }
}
