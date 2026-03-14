import { createWorker } from './queues.js';
import { QUEUE_NAMES } from '@findthem/shared';
import type { CrawlAgentJobData } from '@findthem/shared';
import { CrawlAgentService } from '../agent/crawlAgent/index.js';
import { createLogger } from '../logger.js';

const log = createLogger('crawlAgentJob');

export function startCrawlAgentWorker() {
  return createWorker<CrawlAgentJobData>(
    QUEUE_NAMES.CRAWL_AGENT,
    async (job) => {
      log.info({ jobId: job.id, data: job.data }, 'Crawl agent job started');
      const agent = new CrawlAgentService();
      const result = await agent.run(job.data);
      log.info({ jobId: job.id, summary: result.summary }, 'Crawl agent job completed');
    },
    { concurrency: 1 },
  );
}
