import type { Job } from 'bullmq';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { sendMatchNotification } from '../services/notificationService.js';
import { createWorker, type NotificationJobData } from './queues.js';

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
    console.warn(`[NOTIFICATION] match(${matchId}) 또는 report(${reportId})를 찾을 수 없음`);
    return;
  }

  if (!report.user) {
    console.warn(`[NOTIFICATION] Report ${reportId}에 연결된 사용자 없음, 건너뜀`);
    return;
  }

  // 이미 알림 전송된 경우 중복 방지
  if (match.status === 'NOTIFIED') {
    console.log(`[NOTIFICATION] Match ${matchId} 이미 알림 전송됨, 건너뜀`);
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
  console.log('Notification worker started');
  createWorker<NotificationJobData>('notification', processNotificationJob, {
    concurrency: 5,
  });
}
