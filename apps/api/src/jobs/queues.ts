import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config.js';
import { QUEUE_NAMES } from '@findthem/shared';

// Re-export job data types from shared
export type {
  ImageJobData,
  PromotionJobData,
  MatchingJobData,
  NotificationJobData,
  CleanupJobData,
} from '@findthem/shared';

import type {
  ImageJobData,
  PromotionJobData,
  MatchingJobData,
  NotificationJobData,
  CleanupJobData,
} from '@findthem/shared';

// BullMQ는 자체 ioredis를 사용하므로 URL 문자열로 전달
const connection = { url: config.redisUrl };

// ── Queue 정의 ──

export const imageQueue = new Queue<ImageJobData>(QUEUE_NAMES.IMAGE_PROCESSING, { connection });
export const promotionQueue = new Queue<PromotionJobData>(QUEUE_NAMES.PROMOTION, { connection });
export const matchingQueue = new Queue<MatchingJobData>(QUEUE_NAMES.MATCHING, { connection });
export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, { connection });
export const cleanupQueue = new Queue<CleanupJobData>(QUEUE_NAMES.CLEANUP, { connection });

// ── Worker 생성 헬퍼 ──

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: { concurrency?: number },
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency: options?.concurrency || 2,
  });

  worker.on('completed', (job) => {
    console.log(`[${queueName}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[${queueName}] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
