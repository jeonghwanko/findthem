import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { sendMatchNotification } from '../services/notificationService.js';
import { sendPushNotification } from '../services/fcmService.js';
import { createWorker, type NotificationJobData } from './queues.js';
import { QUEUE_NAMES } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('notificationJob');

async function processNotificationJob(job: Job<NotificationJobData>) {
  const { matchId, reportId } = job.data;

  // RACE-04: 알림 발송 전 상태를 원자적으로 선점
  // update where { status: { not: 'NOTIFIED' } } 로 한 워커만 성공하도록 보장
  const claimedMatch = await prisma.match.update({
    where: { id: matchId, status: { not: 'NOTIFIED' } },
    data: { status: 'NOTIFIED' },
    include: {
      report: { include: { user: { select: { id: true, name: true, phone: true, fcmToken: true } } } },
    },
  }).catch(() => null);

  if (!claimedMatch) {
    log.info({ matchId }, 'Match already notified or not found, skipping');
    return;
  }

  const report = claimedMatch.report;

  if (!report) {
    log.warn({ matchId, reportId }, 'Report not found');
    return;
  }

  if (!report.user) {
    log.warn({ reportId }, 'No user linked to report, skipping');
    return;
  }

  const sightingUrl = `${config.webOrigin}/reports/${reportId}?matchId=${matchId}`;

  await Promise.all([
    sendMatchNotification({
      recipientPhone: report.user.phone,
      recipientName: report.user.name,
      reportName: report.name,
      subjectType: report.subjectType,
      confidence: claimedMatch.confidence,
      matchId,
      sightingUrl,
      userId: report.user.id,
    }),
    report.user.fcmToken
      ? sendPushNotification(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          report.userId!,
          report.user.fcmToken,
          'Match Found!',
          `A new sighting has been matched for ${report.name}.`,
          { reportId: report.id, matchId },
        )
      : Promise.resolve(),
  ]);
}

export function startNotificationWorker() {
  log.info('Notification worker started');
  createWorker<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, processNotificationJob, {
    concurrency: 5,
  });
}
