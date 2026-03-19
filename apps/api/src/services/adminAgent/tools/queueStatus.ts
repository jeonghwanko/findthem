import type { Queue } from 'bullmq';
import { QUEUE_MAP } from '../../../jobs/queues.js';
import { QUEUE_NAMES, type QueueStatusSummary } from '@findthem/shared';

type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export interface QueueStatusInput {
  queueName: QueueName | 'all';
}

async function getSingleQueueStatus(queue: Queue): Promise<QueueStatusSummary> {
  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);
  return { name: queue.name, waiting, active, completed, failed, delayed, paused };
}

export async function getQueueStatus(input: QueueStatusInput): Promise<unknown> {
  if (input.queueName === 'all') {
    const statuses = await Promise.all(Object.values(QUEUE_MAP).map(getSingleQueueStatus));
    return statuses;
  }

  const queue = QUEUE_MAP[input.queueName];
  if (!queue) {
    return { error: `Unknown queue: ${input.queueName}` };
  }
  return getSingleQueueStatus(queue);
}
