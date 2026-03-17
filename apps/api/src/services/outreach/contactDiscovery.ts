import { config } from '../../config.js';
import { prisma } from '../../db/client.js';
import { createLogger } from '../../logger.js';
import { YouTubeAdapter } from '../../platforms/youtube.js';
import { generateVideoComment } from '../../ai/outreachContentAgent.js';
import type { Prisma } from '@prisma/client';

const log = createLogger('contactDiscovery');

// ── Types ──

interface GoogleSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
  pagemap?: {
    metatags?: Array<Record<string, string>>;
    person?: Array<{ name?: string; email?: string }>;
  };
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

interface YouTubeSearchItem {
  id?: { channelId?: string };
  snippet?: { channelTitle?: string; description?: string };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

interface YouTubeChannelItem {
  id?: string;
  snippet?: { title?: string; description?: string; customUrl?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
  statistics?: { subscriberCount?: string };
}

interface YouTubeChannelResponse {
  items?: YouTubeChannelItem[];
}

interface DiscoveredContact {
  type: 'JOURNALIST' | 'YOUTUBER';
  name: string;
  email?: string;
  youtubeChannelId?: string;
  youtubeChannelUrl?: string;
  thumbnailUrl?: string;
  organization?: string;
  topics: string[];
  subscriberCount?: number;
  source: string;
}

// ── Report 타입 (필요한 필드만) ──

interface ReportForOutreach {
  id: string;
  subjectType: string;
  name: string;
  features: string;
  lastSeenAddress: string;
}

interface ReportForVideoOutreach extends ReportForOutreach {
  lastSeenAt: Date;
  contactName: string;
  aiDescription?: string | null;
}

// ── 이메일 추출 헬퍼 ──

function extractEmailsFromText(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  return text.match(emailRegex) ?? [];
}

// ── Google Custom Search ──

export async function searchGoogleForContacts(keywords: string[]): Promise<DiscoveredContact[]> {
  if (!config.googleCseApiKey || !config.googleCseId) {
    log.warn('Google CSE API key or CX not configured, skipping');
    return [];
  }

  const contacts: DiscoveredContact[] = [];

  for (const keyword of keywords.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        key: config.googleCseApiKey,
        cx: config.googleCseId,
        q: keyword,
        num: '10',
      });

      const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ keyword, status: res.status }, 'Google CSE request failed');
        continue;
      }

      const data = (await res.json()) as GoogleSearchResponse;
      if (!data.items) continue;

      for (const item of data.items) {
        const text = [item.title ?? '', item.snippet ?? ''].join(' ');
        const emails = extractEmailsFromText(text);

        // metatags에서도 이메일 추출
        const metatagEmails: string[] = [];
        for (const tag of item.pagemap?.metatags ?? []) {
          for (const val of Object.values(tag)) {
            if (typeof val === 'string' && val.includes('@')) {
              metatagEmails.push(...extractEmailsFromText(val));
            }
          }
        }

        const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        const DUMMY_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'example', 'test'];
        const allEmails = [...new Set([...emails, ...metatagEmails])].filter(
          (e) =>
            !IMAGE_EXTS.some((ext) => e.endsWith(ext)) &&
            !DUMMY_PREFIXES.some((p) => e.toLowerCase().startsWith(p)),
        );

        // person metatag
        const personName =
          item.pagemap?.person?.[0]?.name ??
          item.title?.split(' - ')[0]?.split(' | ')[0]?.trim() ??
          'Unknown';

        let organization: string | undefined;
        try {
          organization = item.link ? new URL(item.link).hostname.replace(/^www\./, '') : undefined;
        } catch {
          organization = undefined;
        }

        for (const email of allEmails.slice(0, 2)) {
          contacts.push({
            type: 'JOURNALIST',
            name: personName,
            email,
            organization,
            topics: [keyword],
            source: 'GOOGLE_SEARCH',
          });
        }
      }
    } catch (err) {
      log.warn({ err, keyword }, 'Google CSE search error');
    }
  }

  return contacts;
}

// ── YouTube Channel Search ──

export async function searchYouTubeChannels(keywords: string[]): Promise<DiscoveredContact[]> {
  if (!config.youtubeApiKey) {
    log.warn('YouTube API key not configured, skipping');
    return [];
  }

  const contacts: DiscoveredContact[] = [];

  // search.list = 100 units/call — 키워드 1개만 사용해 쿼터 절약 (일일 10,000 units)
  for (const keyword of keywords.slice(0, 1)) {
    try {
      const searchParams = new URLSearchParams({
        key: config.youtubeApiKey,
        q: keyword,
        type: 'channel',
        part: 'snippet',
        maxResults: '5',
        relevanceLanguage: 'ko',
      });

      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!searchRes.ok) {
        log.warn({ keyword, status: searchRes.status }, 'YouTube search request failed');
        continue;
      }

      const searchData = (await searchRes.json()) as YouTubeSearchResponse;
      const channelIds = (searchData.items ?? [])
        .map((item) => item.id?.channelId)
        .filter((id): id is string => Boolean(id));

      if (channelIds.length === 0) continue;

      // channels.list — 구독자 수 및 상세 정보
      const channelParams = new URLSearchParams({
        key: config.youtubeApiKey,
        id: channelIds.join(','),
        part: 'snippet,statistics',
      });

      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?${channelParams.toString()}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!channelRes.ok) {
        log.warn({ keyword, status: channelRes.status }, 'YouTube channels request failed');
        continue;
      }

      const channelData = (await channelRes.json()) as YouTubeChannelResponse;

      for (const ch of channelData.items ?? []) {
        if (!ch.id) continue;

        const subscriberCount = ch.statistics?.subscriberCount
          ? parseInt(ch.statistics.subscriberCount, 10)
          : undefined;

        // 구독자 1000명 미만은 제외
        if (subscriberCount !== undefined && subscriberCount < 1000) continue;

        const channelUrl = ch.snippet?.customUrl
          ? `https://www.youtube.com/${ch.snippet.customUrl}`
          : `https://www.youtube.com/channel/${ch.id}`;

        const thumbnailUrl =
          ch.snippet?.thumbnails?.high?.url ??
          ch.snippet?.thumbnails?.medium?.url ??
          ch.snippet?.thumbnails?.default?.url ??
          undefined;

        contacts.push({
          type: 'YOUTUBER',
          name: ch.snippet?.title ?? 'Unknown Channel',
          youtubeChannelId: ch.id,
          youtubeChannelUrl: channelUrl,
          thumbnailUrl,
          topics: [keyword],
          subscriberCount,
          source: 'YOUTUBE_API',
        });
      }
    } catch (err) {
      log.warn({ err, keyword }, 'YouTube channel search error');
    }
  }

  return contacts;
}

// ── 키워드 생성 ──

function buildSearchKeywords(report: ReportForOutreach): {
  googleKeywords: string[];
  youtubeKeywords: string[];
} {
  const googleKeywords: string[] = [];
  const youtubeKeywords: string[] = [];

  if (report.subjectType === 'DOG' || report.subjectType === 'CAT') {
    googleKeywords.push('유기동물 실종 반려동물 뉴스 기자', '반려동물 실종 뉴스 이메일');
    youtubeKeywords.push('유기동물 실종 반려동물', '강아지 고양이 실종 찾기');
  } else if (report.subjectType === 'PERSON') {
    googleKeywords.push('실종자 수색 뉴스 기자', '실종 아동 실종자 뉴스 이메일');
    youtubeKeywords.push('실종자 찾기 유튜브', '실종 수색 봉사');
  }

  // 지역 키워드 추가
  const addressParts = report.lastSeenAddress.split(' ').slice(0, 2);
  if (addressParts.length > 0) {
    const region = addressParts.join(' ');
    googleKeywords.push(`${region} 지역 뉴스 기자`);
    youtubeKeywords.push(`${region} 지역 유튜버`);
  }

  return { googleKeywords, youtubeKeywords };
}

// ── Upsert helper ──

async function upsertContact(contact: DiscoveredContact): Promise<string | null> {
  try {
    const updateData: Prisma.OutreachContactUpdateInput = {};
    if (contact.subscriberCount !== undefined) {
      updateData.subscriberCount = contact.subscriberCount;
    }

    const createData: Prisma.OutreachContactCreateInput = {
      type: contact.type,
      name: contact.name,
      email: contact.email,
      youtubeChannelId: contact.youtubeChannelId,
      youtubeChannelUrl: contact.youtubeChannelUrl,
      organization: contact.organization,
      topics: contact.topics,
      subscriberCount: contact.subscriberCount,
      source: contact.source,
      isActive: true,
    };

    if (contact.email) {
      const result = await prisma.outreachContact.upsert({
        where: { email: contact.email },
        create: createData,
        update: updateData,
        select: { id: true },
      });
      return result.id;
    }

    if (contact.youtubeChannelId) {
      const result = await prisma.outreachContact.upsert({
        where: { youtubeChannelId: contact.youtubeChannelId },
        create: createData,
        update: updateData,
        select: { id: true },
      });
      return result.id;
    }

    log.warn({ contactName: contact.name }, 'Contact has no email or youtubeChannelId, skipping upsert');
    return null;
  } catch (err) {
    log.warn({ err, contactName: contact.name }, 'Failed to upsert outreach contact');
    return null;
  }
}

// ── 영상 검색 키워드 (헤르미 — 반려동물 영상 대상) ──

function buildVideoSearchKeywords(subjectType: string): string[] {
  if (subjectType === 'DOG') {
    return ['강아지 일상 브이로그', '유기견 입양 후기', '강아지 키우기'];
  }
  if (subjectType === 'CAT') {
    return ['고양이 일상 브이로그', '길고양이 구조', '고양이 키우기'];
  }
  return [];
}

// ── 영상 기반 아웃리치 발굴 (헤르미) ──

export async function discoverAndSaveVideoContacts(
  report: ReportForVideoOutreach,
): Promise<number> {
  if (report.subjectType === 'PERSON') return 0;
  if (!config.youtubeApiKey) {
    log.warn('YouTube API key not configured, skipping video outreach');
    return 0;
  }

  const keywords = buildVideoSearchKeywords(report.subjectType);
  const youtubeAdapter = new YouTubeAdapter();

  // 모든 키워드의 영상을 먼저 수집
  const allVideos: Array<{ videoId: string; title: string; keyword: string }> = [];
  // search.list = 100 units/call — 키워드 1개, 영상 2개로 쿼터 절약
  for (const keyword of keywords.slice(0, 1)) {
    try {
      const videos = await youtubeAdapter.searchVideos(keyword, 2);
      for (const v of videos) {
        allVideos.push({ ...v, keyword });
      }
    } catch (err) {
      log.warn({ err, keyword, reportId: report.id }, 'Video search error');
    }
  }

  if (allVideos.length === 0) return 0;

  const videoIds = allVideos.map((v) => v.videoId);

  // 기존 컨택 일괄 조회 (N+1 방지)
  const existingContacts = await prisma.outreachContact.findMany({
    where: { videoId: { in: videoIds } },
    select: { id: true, videoId: true },
  });
  const contactByVideoId = new Map(existingContacts.map((c) => [c.videoId, c.id]));

  // 신규 컨택 일괄 생성 (없는 것만)
  const newVideos = allVideos.filter((v) => !contactByVideoId.has(v.videoId));
  if (newVideos.length > 0) {
    await prisma.outreachContact.createMany({
      data: newVideos.map((v) => ({
        type: 'VIDEO',
        name: v.title.slice(0, 100),
        videoId: v.videoId,
        videoTitle: v.title,
        topics: [v.keyword],
        source: 'VIDEO_SEARCH',
        isActive: true,
      })),
      skipDuplicates: true,
    });

    // 생성된 컨택 ID 보충 조회
    const created = await prisma.outreachContact.findMany({
      where: { videoId: { in: newVideos.map((v) => v.videoId) } },
      select: { id: true, videoId: true },
    });
    for (const c of created) {
      if (c.videoId) contactByVideoId.set(c.videoId, c.id);
    }
  }

  // 이 신고에 대해 이미 존재하는 요청 일괄 조회 (N+1 방지)
  const contactIds = [...contactByVideoId.values()];
  const existingRequests = await prisma.outreachRequest.findMany({
    where: {
      reportId: report.id,
      contactId: { in: contactIds },
      channel: 'YOUTUBE_COMMENT',
    },
    select: { contactId: true },
  });
  const alreadyRequestedContactIds = new Set(existingRequests.map((r) => r.contactId));

  let createdCount = 0;
  for (const video of allVideos) {
    const contactId = contactByVideoId.get(video.videoId);
    if (!contactId || alreadyRequestedContactIds.has(contactId)) continue;

    try {
      const commentText = await generateVideoComment(report, video.title);
      await prisma.outreachRequest.create({
        data: {
          reportId: report.id,
          contactId,
          channel: 'YOUTUBE_COMMENT',
          status: 'PENDING_APPROVAL',
          draftContent: commentText,
        },
      });
      alreadyRequestedContactIds.add(contactId); // 동일 루프 내 중복 방지
      createdCount++;
      log.info({ reportId: report.id, videoId: video.videoId }, 'Created video outreach request');
    } catch (err) {
      log.warn({ err, videoId: video.videoId, reportId: report.id }, 'Failed to create video outreach request');
    }
  }

  return createdCount;
}

// ── Main orchestrator ──

export async function discoverAndSaveContacts(
  report: ReportForOutreach,
): Promise<{ contactIds: string[]; journalistCount: number; youtuberCount: number }> {
  const { googleKeywords, youtubeKeywords } = buildSearchKeywords(report);

  const [journalists, youtubers] = await Promise.all([
    searchGoogleForContacts(googleKeywords),
    searchYouTubeChannels(youtubeKeywords),
  ]);

  log.info(
    { reportId: report.id, journalists: journalists.length, youtubers: youtubers.length },
    'Discovered contacts',
  );

  const [journalistResults, youtuberResults] = await Promise.all([
    Promise.all(journalists.map((contact) => upsertContact(contact))),
    Promise.all(youtubers.map((contact) => upsertContact(contact))),
  ]);

  const journalistIds = journalistResults.filter((id): id is string => id !== null);
  const youtuberIds = youtuberResults.filter((id): id is string => id !== null);

  return {
    contactIds: [...journalistIds, ...youtuberIds],
    journalistCount: journalistIds.length,
    youtuberCount: youtuberIds.length,
  };
}
