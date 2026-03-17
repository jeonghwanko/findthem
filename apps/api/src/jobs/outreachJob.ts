import { QUEUE_NAMES, OUTREACH_EMAIL_DAILY_LIMIT, OUTREACH_COMMENT_DAILY_LIMIT } from '@findthem/shared';
import type { OutreachJobData } from './queues.js';
import { createWorker, outreachQueue } from './queues.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import { discoverAndSaveContacts, discoverAndSaveVideoContacts } from '../services/outreach/contactDiscovery.js';
import { generateOutreachEmail, generateYouTubeComment } from '../ai/outreachContentAgent.js';
import { GmailAdapter } from '../platforms/gmail.js';
import { YouTubeAdapter } from '../platforms/youtube.js';
import { postHeimi } from '../services/communityAgentService.js';

const log = createLogger('outreachJob');

const OUTREACH_CRON = '0 9 * * *'; // 매일 09:00 KST
const OUTREACH_CRON_TZ = 'Asia/Seoul';

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

  // 채널 기반 아웃리치 — 이미 있으면 스킵
  const existingChannelCount = await prisma.outreachRequest.count({
    where: { reportId, contact: { type: { in: ['JOURNALIST', 'YOUTUBER'] } } },
  });

  if (existingChannelCount === 0) {
    const { contactIds } = await discoverAndSaveContacts(report);

    if (contactIds.length > 0) {
      // 발견된 각 컨택에 대해 AI 초안 생성 및 OutreachRequest 저장
      await createChannelOutreachRequests(report, contactIds);
    }
  } else {
    log.info({ reportId, existingChannelCount }, 'Channel outreach already exists, skipping channel discovery');
  }

  // 영상 기반 아웃리치 (헤르미) — DOG/CAT만, 내부에서 중복 체크
  if (report.subjectType !== 'PERSON') {
    const videoCount = await discoverAndSaveVideoContacts(report);
    log.info({ reportId, videoCount }, 'Video outreach requests created');
  }
}

// ── 채널 기반 OutreachRequest 생성 헬퍼 ──

async function createChannelOutreachRequests(
  report: {
    id: string;
    subjectType: string;
    name: string;
    features: string;
    lastSeenAt: Date;
    lastSeenAddress: string;
    contactName: string;
    aiDescription?: string | null;
  },
  contactIds: string[],
): Promise<void> {
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
      if (contact.email) {
        const draft = await generateOutreachEmail(report, contact);

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
        // 발송 시점에 getLatestVideo로 영상을 찾으므로 여기서는 채널명으로 초안 생성
        // (searchVideos 호출 제거 — YouTube API quota 100 unit/call 절약)
        const videoTitle = contact.name;
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

  log.info({ reportId: report.id, created }, 'Channel outreach requests created');
}

// ── send-outreach handler ──

async function handleSendOutreach(outreachRequestId: string): Promise<void> {
  const request = await prisma.outreachRequest.findUnique({
    where: { id: outreachRequestId },
    include: {
      contact: {
        select: { email: true, youtubeChannelId: true, videoId: true, name: true, type: true },
      },
      report: {
        select: { name: true, subjectType: true },
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
    log.warn({ outreachRequestId, channel, sentToday, dailyLimit }, 'Daily limit reached, keeping APPROVED for next run');
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
      const youtubeAdapter = new YouTubeAdapter();
      let targetVideoId: string;

      if (request.contact.videoId) {
        // VIDEO 타입: 특정 영상에 직접 댓글
        targetVideoId = request.contact.videoId;
      } else if (request.contact.youtubeChannelId) {
        // YOUTUBER 타입: 채널의 최신 영상에 댓글
        const latestVideo = await youtubeAdapter.getLatestVideo(request.contact.youtubeChannelId);
        if (!latestVideo) {
          throw new Error('No recent videos found for YouTube channel');
        }
        targetVideoId = latestVideo.videoId;
      } else {
        throw new Error('Contact has no YouTube channel ID or video ID');
      }

      externalId = await youtubeAdapter.postComment(targetVideoId, request.draftContent);
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

    // 커뮤니티 게시 (fire-and-forget)
    void postHeimi(
      request.report.name,
      request.contact.name,
      channel,
      request.report.subjectType,
    ).catch((err) => log.warn({ err }, 'Heimi community post failed'));

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
  // Retry approved but unsent requests from previous days
  const pendingSend = await prisma.outreachRequest.findMany({
    where: { status: 'APPROVED', sentAt: null },
    take: 5,
  });

  for (const req of pendingSend) {
    await outreachQueue.add(
      'send-outreach',
      { type: 'send-outreach', outreachRequestId: req.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  }

  if (pendingSend.length > 0) {
    log.info({ count: pendingSend.length }, 'Re-queued approved unsent outreach requests');
  }

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
    { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, repeat: { pattern: OUTREACH_CRON, tz: OUTREACH_CRON_TZ } },
  );

  log.info({ cron: OUTREACH_CRON }, 'Outreach cron scheduled');
}
