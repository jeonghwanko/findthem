import { prisma } from '../../../db/client.js';
import { imageQueue } from '../../../jobs/queues.js';

interface HealthEntry {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export async function getSystemHealth(): Promise<Record<string, HealthEntry>> {
  const checks: Record<string, HealthEntry> = {};

  await Promise.all([
    (async () => {
      try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - start };
      } catch (e) {
        checks.database = {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })(),
    (async () => {
      try {
        const start = Date.now();
        const client = await imageQueue.client;
        await client.ping();
        checks.redis = { status: 'ok', latencyMs: Date.now() - start };
      } catch (e) {
        checks.redis = {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })(),
  ]);

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return { ...checks, overall: { status: allOk ? 'ok' : 'error' } };
}
