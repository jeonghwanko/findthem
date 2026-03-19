import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config.js';
import {
  QUEUE_NAMES,
  type ImageJobData,
  type PromotionJobData,
  type MatchingJobData,
  type NotificationJobData,
  type CleanupJobData,
  type PromotionMonitorJobData,
  type PromotionRepostJobData,
  type CrawlDispatchJobData,
  type CrawlSourceJobData,
  type CrawlAgentJobData,
  type OutreachJobData,
  type QaCrawlJobData,
} from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('queues');

// Re-export job data types from shared
export type {
  ImageJobData,
  PromotionJobData,
  MatchingJobData,
  NotificationJobData,
  CleanupJobData,
  PromotionMonitorJobData,
  PromotionRepostJobData,
  CrawlDispatchJobData,
  CrawlSourceJobData,
  CrawlAgentJobData,
  OutreachJobData,
  QaCrawlJobData,
} from '@findthem/shared';


// BullMQ는 자체 ioredis를 사용하므로 URL 문자열로 전달
const connection = { url: config.redisUrl };

// ── Queue 정의 ──

export const imageQueue = new Queue<ImageJobData>(QUEUE_NAMES.IMAGE_PROCESSING, { connection });
export const promotionQueue = new Queue<PromotionJobData>(QUEUE_NAMES.PROMOTION, { connection });
export const matchingQueue = new Queue<MatchingJobData>(QUEUE_NAMES.MATCHING, { connection });
export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, { connection });
export const cleanupQueue = new Queue<CleanupJobData>(QUEUE_NAMES.CLEANUP, { connection });
export const promotionMonitorQueue = new Queue<PromotionMonitorJobData>(QUEUE_NAMES.PROMOTION_MONITOR, { connection });
export const promotionRepostQueue = new Queue<PromotionRepostJobData>(QUEUE_NAMES.PROMOTION_REPOST, { connection });
export const crawlSchedulerQueue = new Queue<CrawlDispatchJobData>(QUEUE_NAMES.CRAWL_SCHEDULER, { connection });
export const crawlQueue = new Queue<CrawlSourceJobData>(QUEUE_NAMES.CRAWL, { connection });
export const crawlAgentQueue = new Queue<CrawlAgentJobData>(QUEUE_NAMES.CRAWL_AGENT, { connection });
export const outreachQueue = new Queue<OutreachJobData>(QUEUE_NAMES.OUTREACH, { connection });
export const qaCrawlQueue = new Queue<QaCrawlJobData>(QUEUE_NAMES.QA_CRAWL, { connection });

// ── 큐 이름 → 큐 인스턴스 맵 (SSOT) ──

export const QUEUE_MAP: Record<string, Queue> = {
  [QUEUE_NAMES.IMAGE_PROCESSING]: imageQueue,
  [QUEUE_NAMES.PROMOTION]: promotionQueue,
  [QUEUE_NAMES.MATCHING]: matchingQueue,
  [QUEUE_NAMES.NOTIFICATION]: notificationQueue,
  [QUEUE_NAMES.CLEANUP]: cleanupQueue,
  [QUEUE_NAMES.PROMOTION_MONITOR]: promotionMonitorQueue,
  [QUEUE_NAMES.PROMOTION_REPOST]: promotionRepostQueue,
  [QUEUE_NAMES.CRAWL_SCHEDULER]: crawlSchedulerQueue,
  [QUEUE_NAMES.CRAWL]: crawlQueue,
  [QUEUE_NAMES.CRAWL_AGENT]: crawlAgentQueue,
  [QUEUE_NAMES.OUTREACH]: outreachQueue,
  [QUEUE_NAMES.QA_CRAWL]: qaCrawlQueue,
};

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
    log.info({ queueName, jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ err, queueName, jobId: job?.id }, 'Job failed');
  });

  return worker;
}
