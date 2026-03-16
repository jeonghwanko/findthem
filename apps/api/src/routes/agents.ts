import type { Router } from 'express';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';

const log = createLogger('agents');

interface ActivityCache {
  data: AgentActivityStats;
  cachedAt: number;
}

interface AgentActivityStats {
  'image-matching': {
    todayMatches: number;
    todayAnalyzed: number;
    weekMatches: number;
    totalMatches: number;
    lastActiveAt: string | null;
  };
  promotion: {
    todayPosts: number;
    weekPosts: number;
    totalPosts: number;
    platforms: { twitter: number; kakao: number };
    lastActiveAt: string | null;
  };
  'chatbot-alert': {
    todaySightings: number;
    todayNotifications: number;
    weekSightings: number;
    totalSightings: number;
    lastActiveAt: string | null;
  };
}

const CACHE_TTL_MS = 60_000;
let cache: ActivityCache | null = null;

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchActivityStats(): Promise<AgentActivityStats> {
  const today = todayStart();
  const week = weekStart();

  const [
    todayMatches,
    weekMatches,
    totalMatches,
    lastMatch,
    todayAnalyzed,
    todayPosts,
    weekPosts,
    totalPosts,
    twitterPosts,
    kakaoPosts,
    lastPromotion,
    todaySightings,
    todayNotifications,
    weekSightings,
    totalSightings,
    lastSighting,
  ] = await Promise.all([
    // image-matching: Match counts
    prisma.match.count({ where: { createdAt: { gte: today } } }),
    prisma.match.count({ where: { createdAt: { gte: week } } }),
    prisma.match.count(),
    prisma.match.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),

    // image-matching: analyzed images proxy (ReportPhoto today)
    prisma.reportPhoto.count({ where: { createdAt: { gte: today } } }),

    // promotion: Promotion posted counts
    prisma.promotion.count({ where: { status: 'POSTED', createdAt: { gte: today } } }),
    prisma.promotion.count({ where: { status: 'POSTED', createdAt: { gte: week } } }),
    prisma.promotion.count({ where: { status: 'POSTED' } }),
    prisma.promotion.count({ where: { status: 'POSTED', platform: 'TWITTER' } }),
    prisma.promotion.count({ where: { status: 'POSTED', platform: 'KAKAO_CHANNEL' } }),
    prisma.promotion.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),

    // chatbot-alert: Sighting counts
    prisma.sighting.count({ where: { createdAt: { gte: today } } }),
    prisma.match.count({ where: { status: 'NOTIFIED', createdAt: { gte: today } } }),
    prisma.sighting.count({ where: { createdAt: { gte: week } } }),
    prisma.sighting.count(),
    prisma.sighting.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  return {
    'image-matching': {
      todayMatches,
      todayAnalyzed,
      weekMatches,
      totalMatches,
      lastActiveAt: lastMatch?.createdAt.toISOString() ?? null,
    },
    promotion: {
      todayPosts,
      weekPosts,
      totalPosts,
      platforms: { twitter: twitterPosts, kakao: kakaoPosts },
      lastActiveAt: lastPromotion?.createdAt.toISOString() ?? null,
    },
    'chatbot-alert': {
      todaySightings,
      todayNotifications,
      weekSightings,
      totalSightings,
      lastActiveAt: lastSighting?.createdAt.toISOString() ?? null,
    },
  };
}

export function registerAgentsRoutes(router: Router) {
  // GET /agents/activity — 에이전트 활동 통계 (공개, 캐시 60초)
  router.get('/agents/activity', async (_req, res) => {
    const now = Date.now();

    if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
      log.info('Returning cached agent activity stats');
      res.json(cache.data);
      return;
    }

    log.info('Fetching fresh agent activity stats');
    const data = await fetchActivityStats();

    cache = { data, cachedAt: now };

    res.json(data);
  });
}
