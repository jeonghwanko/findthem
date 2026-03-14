import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { sendMatchNotification } from '../services/notificationService.js';
import { createWorker, type NotificationJobData } from './queues.js';
import { createLogger } from '../logger.js';

const log = createLogger('notificationJob');

async function processNotificationJob(job: Job<NotificationJobData>) {
  const { matchId, reportId } = job.data;

  const [match, report] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      include: { sighting: { include: { photos: true } } },
    }),
    prisma.report.findUnique({
      where: { id: reportId },
      include: { user: true },
    }),
  ]);

  if (!match || !report) {
    log.warn({ matchId, reportId }, 'match 또는 report를 찾을 수 없음');
    return;
  }

  if (!report.user) {
    log.warn({ reportId }, 'Report에 연결된 사용자 없음, 건너뜀');
    return;
  }

  // 이미 알림 전송된 경우 중복 방지
  if (match.status === 'NOTIFIED') {
    log.info({ matchId }, 'Match 이미 알림 전송됨, 건너뜀');
    return;
  }

  const sightingUrl = `${config.webOrigin}/reports/${reportId}?matchId=${matchId}`;

  await sendMatchNotification({
    recipientPhone: report.user.phone,
    recipientName: report.user.name,
    reportName: report.name,
    subjectType: report.subjectType,
    confidence: match.confidence,
    matchId,
    sightingUrl,
  });

  await prisma.match.update({
    where: { id: matchId },
    data: { status: 'NOTIFIED' },
  });
}

export function startNotificationWorker() {
  log.info('Notification worker started');
  createWorker<NotificationJobData>('notification', processNotificationJob, {
    concurrency: 5,
  });
}
