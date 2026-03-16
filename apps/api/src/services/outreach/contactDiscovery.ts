import { config } from '../../config.js';
import { prisma } from '../../db/client.js';
import { createLogger } from '../../logger.js';
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
  snippet?: { title?: string; description?: string; customUrl?: string };
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

        const allEmails = [...new Set([...emails, ...metatagEmails])].filter(
          (e) => !e.endsWith('.png') && !e.endsWith('.jpg'),
        );

        // person metatag
        const personName =
          item.pagemap?.person?.[0]?.name ??
          item.title?.split(' - ')[0]?.split(' | ')[0]?.trim() ??
          'Unknown';

        const organization = item.link
          ? new URL(item.link).hostname.replace(/^www\./, '')
          : undefined;

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

  for (const keyword of keywords.slice(0, 3)) {
    try {
      // search.list — 채널 검색
      const searchParams = new URLSearchParams({
        key: config.youtubeApiKey,
        q: keyword,
        type: 'channel',
        part: 'snippet',
        maxResults: '10',
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

        contacts.push({
          type: 'YOUTUBER',
          name: ch.snippet?.title ?? 'Unknown Channel',
          youtubeChannelId: ch.id,
          youtubeChannelUrl: channelUrl,
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
    // 이메일 혹은 채널 ID로 중복 체크
    let existing: { id: string } | null = null;

    if (contact.email) {
      existing = await prisma.outreachContact.findUnique({
        where: { email: contact.email },
        select: { id: true },
      });
    }

    if (!existing && contact.youtubeChannelId) {
      existing = await prisma.outreachContact.findUnique({
        where: { youtubeChannelId: contact.youtubeChannelId },
        select: { id: true },
      });
    }

    if (existing) {
      // 구독자 수 업데이트만 수행
      const updateData: Prisma.OutreachContactUpdateInput = {
        lastContactedAt: undefined,
      };
      if (contact.subscriberCount !== undefined) {
        updateData.subscriberCount = contact.subscriberCount;
      }
      await prisma.outreachContact.update({
        where: { id: existing.id },
        data: updateData,
      });
      return existing.id;
    }

    const created = await prisma.outreachContact.create({
      data: {
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
      },
      select: { id: true },
    });

    return created.id;
  } catch (err) {
    log.warn({ err, contactName: contact.name }, 'Failed to upsert outreach contact');
    return null;
  }
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

  const contactIds: string[] = [];
  let journalistCount = 0;
  let youtuberCount = 0;

  for (const contact of journalists) {
    const id = await upsertContact(contact);
    if (id) {
      contactIds.push(id);
      journalistCount++;
    }
  }

  for (const contact of youtubers) {
    const id = await upsertContact(contact);
    if (id) {
      contactIds.push(id);
      youtuberCount++;
    }
  }

  return { contactIds, journalistCount, youtuberCount };
}
