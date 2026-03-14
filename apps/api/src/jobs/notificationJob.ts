import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { sendMatchNotification } from '../services/notificationService.js';
import { createWorker, type NotificationJobData } from './queues.js';
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
      sighting: { include: { photos: true } },
      report: { include: { user: true } },
    },
  }).catch(() => null);

  if (!claimedMatch) {
    log.info({ matchId }, 'Match 이미 알림 전송됨 또는 존재하지 않음, 건너뜀');
    return;
  }

  const report = claimedMatch.report;

  if (!report) {
    log.warn({ matchId, reportId }, 'report를 찾을 수 없음');
    return;
  }

  if (!report.user) {
    log.warn({ reportId }, 'Report에 연결된 사용자 없음, 건너뜀');
    return;
  }

  const sightingUrl = `${config.webOrigin}/reports/${reportId}?matchId=${matchId}`;

  await sendMatchNotification({
    recipientPhone: report.user.phone,
    recipientName: report.user.name,
    reportName: report.name,
    subjectType: report.subjectType,
    confidence: claimedMatch.confidence,
    matchId,
    sightingUrl,
  });
}

export function startNotificationWorker() {
  log.info('Notification worker started');
  createWorker<NotificationJobData>('notification', processNotificationJob, {
    concurrency: 5,
  });
}
