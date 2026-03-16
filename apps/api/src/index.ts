import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './db/client.js';
import { startImageWorker } from './jobs/imageProcessingJob.js';
import { startPromotionWorker } from './jobs/promotionJob.js';
import { startMatchingWorker } from './jobs/matchingJob.js';
import { startNotificationWorker } from './jobs/notificationJob.js';
import { startCleanupWorker } from './jobs/cleanupJob.js';
import { startCrawlWorker, scheduleCrawlJob } from './jobs/crawlJob.js';
import { startCrawlAgentWorker } from './jobs/crawlAgentJob.js';
import { startPromotionMonitorWorker } from './jobs/promotionMonitorJob.js';
import { startPromotionRepostWorker, schedulePromotionRepostJob } from './jobs/promotionRepostJob.js';
import { startOutreachWorker, scheduleOutreachJob } from './jobs/outreachJob.js';
import { createLogger } from './logger.js';

const log = createLogger('server');

async function main() {
  // DB 연결
  await prisma.$connect();
  log.info('Database connected');

  // BullMQ 워커 시작
  startImageWorker();
  startPromotionWorker();
  startMatchingWorker();
  startNotificationWorker();
  startCleanupWorker();
  startCrawlWorker();
  startCrawlAgentWorker();
  startPromotionMonitorWorker();
  startPromotionRepostWorker();
  startOutreachWorker();
  await scheduleCrawlJob();
  await schedulePromotionRepostJob();
  await scheduleOutreachJob();

  // 서버 시작
  app.listen(config.port, () => {
    log.info({ port: config.port }, `API server running on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  log.error({ err }, 'Failed to start server');
  process.exit(1);
});
