import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './db/client.js';
import { startImageWorker } from './jobs/imageProcessingJob.js';
import { startPromotionWorker } from './jobs/promotionJob.js';
import { startMatchingWorker } from './jobs/matchingJob.js';
import { startNotificationWorker } from './jobs/notificationJob.js';
import { startCleanupWorker } from './jobs/cleanupJob.js';

async function main() {
  // DB 연결
  await prisma.$connect();
  console.log('Database connected');

  // BullMQ 워커 시작
  startImageWorker();
  startPromotionWorker();
  startMatchingWorker();
  startNotificationWorker();
  startCleanupWorker();

  // 서버 시작
  app.listen(config.port, () => {
    console.log(`API server running on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
