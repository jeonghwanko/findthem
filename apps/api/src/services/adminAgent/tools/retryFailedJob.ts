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
import { ApiError, ERROR_CODES, QUEUE_NAMES } from '@findthem/shared';

type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export interface RetryFailedJobInput {
  queueName: QueueName;
  jobId: string;
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

export async function retryFailedJob(input: RetryFailedJobInput): Promise<unknown> {
  const queue = QUEUE_MAP[input.queueName];
  if (!queue) {
    throw new ApiError(400, ERROR_CODES.PLATFORM_NOT_SUPPORTED);
  }

  const job = await queue.getJob(input.jobId);
  if (!job) {
    throw new ApiError(404, ERROR_CODES.INVALID_JOB_DATA);
  }

  const state = await job.getState();
  if (state !== 'failed') {
    return {
      success: false,
      message: `job이 failed 상태가 아닙니다. 현재 상태: ${state}`,
      job: { id: job.id, name: job.name, state },
    };
  }

  await job.retry();

  return {
    success: true,
    message: `job ${input.jobId}(${job.name})을 재시도 큐에 추가했습니다.`,
    job: {
      id: job.id,
      name: job.name,
      queueName: input.queueName,
      data: job.data,
      previousFailedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    },
  };
}
