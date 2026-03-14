import type { Queue } from 'bullmq';
import {
  imageQueue,
  promotionQueue,
  matchingQueue,
  notificationQueue,
  cleanupQueue,
  promotionMonitorQueue,
  promotionRepostQueue,
} from '../../../jobs/queues.js';

export interface RecentErrorsInput {
  queueName?:
    | 'image-processing'
    | 'promotion'
    | 'matching'
    | 'notification'
    | 'cleanup'
    | 'promotion-monitor'
    | 'promotion-repost';
  limit?: number;
}

const QUEUE_MAP: Record<string, Queue> = {
  'image-processing': imageQueue,
  promotion: promotionQueue,
  matching: matchingQueue,
  notification: notificationQueue,
  cleanup: cleanupQueue,
  'promotion-monitor': promotionMonitorQueue,
  'promotion-repost': promotionRepostQueue,
};

export async function getRecentErrors(input: RecentErrorsInput): Promise<unknown> {
  const limit = Math.min(input.limit ?? 20, 100);

  const queuesToCheck: Queue[] = input.queueName
    ? ([QUEUE_MAP[input.queueName]].filter((q): q is Queue => q !== undefined))
    : Object.values(QUEUE_MAP);

  const results: {
    queueName: string;
    id: string | undefined;
    name: string;
    data: unknown;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
    processedOn: number | undefined;
    finishedOn: number | undefined;
  }[] = [];

  for (const q of queuesToCheck) {
    const jobs = await q.getFailed(0, limit - 1);
    for (const job of jobs) {
      results.push({
        queueName: q.name,
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      });
    }
  }

  const sorted = results
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, limit);

  return {
    failedJobs: sorted.map((j) => ({
      ...j,
      timestampIso: j.timestamp ? new Date(j.timestamp).toISOString() : null,
    })),
    total: sorted.length,
  };
}
