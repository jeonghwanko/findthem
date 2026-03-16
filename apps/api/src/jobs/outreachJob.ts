import { QUEUE_NAMES, OUTREACH_EMAIL_DAILY_LIMIT, OUTREACH_COMMENT_DAILY_LIMIT } from '@findthem/shared';
import type { OutreachJobData } from './queues.js';
import { createWorker, outreachQueue } from './queues.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import { discoverAndSaveContacts } from '../services/outreach/contactDiscovery.js';
import { generateOutreachEmail, generateYouTubeComment } from '../ai/outreachContentAgent.js';
import { GmailAdapter } from '../platforms/gmail.js';
import { YouTubeAdapter } from '../platforms/youtube.js';

const log = createLogger('outreachJob');

const OUTREACH_CRON = '0 9 * * *'; // 매일 09:00

// ── Daily limit check ──

async function getTodaySentCount(channel: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.outreachRequest.count({
    where: {
      channel,
      status: 'SENT',
      sentAt: { gte: startOfDay },
    },
  });
}

// ── discover-contacts handler ──

async function handleDiscoverContacts(reportId: string): Promise<void> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      subjectType: true,
      name: true,
      features: true,
      lastSeenAt: true,
      lastSeenAddress: true,
      contactName: true,
      aiDescription: true,
      promotionStrategy: {
        select: { urgency: true },
      },
    },
  });

  if (!report) {
    log.warn({ reportId }, 'Report not found for outreach discovery');
    return;
  }

  if (report.promotionStrategy?.urgency === 'LOW') {
    log.info({ reportId }, 'Skipping LOW urgency report for outreach');
    return;
  }

  // 이미 해당 신고에 아웃리치 요청이 있는지 확인
  const existingCount = await prisma.outreachRequest.count({
    where: { reportId },
  });

  if (existingCount > 0) {
    log.info({ reportId, existingCount }, 'Report already has outreach requests, skipping discovery');
    return;
  }

  const { contactIds } = await discoverAndSaveContacts(report);

  if (contactIds.length === 0) {
    log.info({ reportId }, 'No contacts discovered');
    return;
  }

  // 발견된 각 컨택에 대해 AI 초안 생성 및 OutreachRequest 저장
  const contacts = await prisma.outreachContact.findMany({
    where: { id: { in: contactIds }, isActive: true },
    select: {
      id: true,
      type: true,
      name: true,
      email: true,
      youtubeChannelId: true,
      organization: true,
      topics: true,
    },
  });

  let created = 0;

  for (const contact of contacts) {
    try {
      // 채널 결정: 이메일 우선, 이메일 없으면 YouTube 댓글
      if (contact.email) {
        const draft = await generateOutreachEmail(report, contact);

        // upsert 패턴: @@unique([reportId, contactId, channel])
        await prisma.outreachRequest.upsert({
          where: {
            reportId_contactId_channel: {
              reportId: report.id,
              contactId: contact.id,
              channel: 'EMAIL',
            },
          },
          create: {
            reportId: report.id,
            contactId: contact.id,
            channel: 'EMAIL',
            status: 'PENDING_APPROVAL',
            draftSubject: draft.subject,
            draftContent: draft.body,
          },
          update: {},
        });
        created++;
      } else if (contact.youtubeChannelId) {
        // YouTube 채널이 있으면 최신 영상을 찾아 댓글 초안 생성
        const youtubeAdapter = new YouTubeAdapter();
        const subjectLabel =
          report.subjectType === 'DOG'
            ? '유기동물 강아지'
            : report.subjectType === 'CAT'
              ? '유기동물 고양이'
              : '실종자 찾기';

        const videos = await youtubeAdapter.searchVideos(
          `${subjectLabel} ${report.lastSeenAddress.split(' ').slice(0, 2).join(' ')}`,
          3,
        );

        const videoTitle = videos[0]?.title ?? subjectLabel;
        const commentText = await generateYouTubeComment(report, videoTitle);

        await prisma.outreachRequest.upsert({
          where: {
            reportId_contactId_channel: {
              reportId: report.id,
              contactId: contact.id,
              channel: 'YOUTUBE_COMMENT',
            },
          },
          create: {
            reportId: report.id,
            contactId: contact.id,
            channel: 'YOUTUBE_COMMENT',
            status: 'PENDING_APPROVAL',
            draftContent: commentText,
          },
          update: {},
        });
        created++;
      }
    } catch (err) {
      log.warn({ err, contactId: contact.id, reportId: report.id }, 'Failed to create outreach request');
    }
  }

  log.info({ reportId, created }, 'Outreach requests created');
}

// ── send-outreach handler ──

async function handleSendOutreach(outreachRequestId: string): Promise<void> {
  const request = await prisma.outreachRequest.findUnique({
    where: { id: outreachRequestId },
    include: {
      contact: {
        select: { email: true, youtubeChannelId: true, name: true },
      },
    },
  });

  if (!request) {
    log.warn({ outreachRequestId }, 'OutreachRequest not found');
    return;
  }

  if (request.status !== 'APPROVED') {
    log.warn({ outreachRequestId, status: request.status }, 'Request not approved, skipping send');
    return;
  }

  // daily limit check
  const channel = request.channel;
  const dailyLimit = channel === 'EMAIL' ? OUTREACH_EMAIL_DAILY_LIMIT : OUTREACH_COMMENT_DAILY_LIMIT;
  const sentToday = await getTodaySentCount(channel);

  if (sentToday >= dailyLimit) {
    log.warn({ outreachRequestId, channel, sentToday, dailyLimit }, 'Daily limit reached, skipping');
    await prisma.outreachRequest.update({
      where: { id: outreachRequestId },
      data: {
        status: 'PENDING_APPROVAL',
        errorMessage: `Daily ${channel} limit reached (${sentToday}/${dailyLimit})`,
      },
    });
    return;
  }

  try {
    let externalId: string | null = null;

    if (channel === 'EMAIL') {
      if (!request.contact.email) {
        throw new Error('Contact has no email address');
      }
      const gmail = new GmailAdapter();
      // 본문을 HTML로 변환 (줄바꿈 → <br>)
      const htmlBody = request.draftContent.replace(/\n/g, '<br>\n');
      externalId = await gmail.sendEmail(
        request.contact.email,
        request.draftSubject ?? `[FindThem] 실종 신고 협력 요청`,
        htmlBody,
      );
    } else if (channel === 'YOUTUBE_COMMENT') {
      if (!request.contact.youtubeChannelId) {
        throw new Error('Contact has no YouTube channel ID');
      }
      // YouTube 채널의 최신 영상에 댓글 게시
      const youtubeAdapter = new YouTubeAdapter();
      const videos = await youtubeAdapter.searchVideos(
        '',
        1,
        request.contact.youtubeChannelId,
      );

      if (videos.length === 0) {
        throw new Error('No recent videos found for YouTube channel');
      }

      externalId = await youtubeAdapter.postComment(videos[0].videoId, request.draftContent);
    } else {
      throw new Error(`Unsupported channel: ${channel}`);
    }

    await prisma.outreachRequest.update({
      where: { id: outreachRequestId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        externalId,
        errorMessage: null,
      },
    });

    // lastContactedAt 업데이트
    await prisma.outreachContact.update({
      where: { id: request.contactId },
      data: { lastContactedAt: new Date() },
    });

    log.info({ outreachRequestId, channel, externalId }, 'Outreach sent successfully');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ err, outreachRequestId }, 'Failed to send outreach');

    await prisma.outreachRequest.update({
      where: { id: outreachRequestId },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });
  }
}

// ── Daily discovery scan ──

async function handleDailyDiscoveryScan(): Promise<void> {
  // ACTIVE 상태이고 HIGH/MEDIUM urgency인 신고 중 아웃리치 없는 것을 찾아 큐 등록
  const reportsNeedingOutreach = await prisma.report.findMany({
    where: {
      status: 'ACTIVE',
      outreachRequests: { none: {} },
      promotionStrategy: {
        urgency: { in: ['HIGH', 'MEDIUM'] },
      },
    },
    select: { id: true },
    take: 20,
  });

  log.info({ count: reportsNeedingOutreach.length }, 'Reports needing outreach discovery');

  for (const report of reportsNeedingOutreach) {
    await outreachQueue.add(
      'discover-contacts',
      { type: 'discover-contacts', reportId: report.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  }
}

// ── Worker ──

export function startOutreachWorker() {
  return createWorker<OutreachJobData>(
    QUEUE_NAMES.OUTREACH,
    async (job) => {
      const { type } = job.data;

      if (type === 'discover-contacts') {
        if (job.data.reportId) {
          await handleDiscoverContacts(job.data.reportId);
        } else {
          // cron triggered scan
          await handleDailyDiscoveryScan();
        }
      } else if (type === 'send-outreach') {
        if (!job.data.outreachRequestId) {
          log.warn({ jobId: job.id }, 'send-outreach job missing outreachRequestId');
          return;
        }
        await handleSendOutreach(job.data.outreachRequestId);
      } else {
        log.warn({ type, jobId: job.id }, 'Unknown outreach job type');
      }
    },
    { concurrency: 2 },
  );
}

// ── Cron schedule ──

export async function scheduleOutreachJob(): Promise<void> {
  const existingJobs = await outreachQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === 'discover-contacts-daily') {
      await outreachQueue.removeRepeatableByKey(job.key);
    }
  }

  await outreachQueue.add(
    'discover-contacts-daily',
    { type: 'discover-contacts' },
    { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, repeat: { pattern: OUTREACH_CRON } },
  );

  log.info({ cron: OUTREACH_CRON }, 'Outreach cron scheduled');
}
