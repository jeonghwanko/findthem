import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanFace, Megaphone, MessageSquare, Heart, ExternalLink } from 'lucide-react';
import { formatTimeAgo } from '@findthem/shared';
import { api, type SponsorPublic, type AgentId } from '../api/client';
import { SponsorItemSkeleton } from '../components/Skeleton';

type AgentTotals = Record<string, { krw: number; usdCents: number }>;

interface AgentActivity {
  todayMatches?: number;
  todayAnalyzed?: number;
  weekMatches?: number;
  totalMatches?: number;
  todayPosts?: number;
  weekPosts?: number;
  totalPosts?: number;
  platforms?: { twitter: number; kakao: number };
  todaySightings?: number;
  todayNotifications?: number;
  weekSightings?: number;
  totalSightings?: number;
  lastActiveAt: string | null;
}

type AgentActivityMap = Record<string, AgentActivity>;

interface AgentConfig {
  id: AgentId;
  nameKey: string;
  roleKey: string;
  descKey: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  onchainId: string;
  wallet: string;
}

const BASESCAN_NFT_URL = 'https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

const AGENTS: AgentConfig[] = [
  {
    id: 'image-matching',
    nameKey: 'team.agentImageMatching.name',
    roleKey: 'team.agentImageMatching.role',
    descKey: 'team.agentImageMatching.desc',
    icon: ScanFace,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    onchainId: '32501',
    wallet: '0xAd7714D358DC67Dc5491b8B7152f1a056F49C089',
  },
  {
    id: 'promotion',
    nameKey: 'team.agentPromotion.name',
    roleKey: 'team.agentPromotion.role',
    descKey: 'team.agentPromotion.desc',
    icon: Megaphone,
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-500',
    badgeBg: 'bg-pink-50',
    badgeText: 'text-pink-700',
    onchainId: '32502',
    wallet: '0xB192B0d602fcd9392e81DF375e25888fB029ff2A',
  },
  {
    id: 'chatbot-alert',
    nameKey: 'team.agentChatbotAlert.name',
    roleKey: 'team.agentChatbotAlert.role',
    descKey: 'team.agentChatbotAlert.desc',
    icon: MessageSquare,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
    badgeBg: 'bg-green-50',
    badgeText: 'text-green-700',
    onchainId: '32503',
    wallet: '0xB6B02dbd3957791710Dc226d264d0184c40EB94d',
  },
];

function ActivitySection({ agent, activity, loading }: { agent: AgentConfig; activity: AgentActivity | undefined; loading: boolean }) {
  const { t, i18n } = useTranslation();

  const a = activity ?? {} as Partial<AgentActivity>;

  const todayLabel =
    agent.id === 'image-matching'
      ? t('team.activity.todayMatches', { count: a.todayMatches ?? 0 })
      : agent.id === 'promotion'
        ? t('team.activity.todayPosts', { count: a.todayPosts ?? 0 })
        : t('team.activity.todaySightings', { count: a.todaySightings ?? 0 });

  const weekCount =
    agent.id === 'image-matching'
      ? a.weekMatches ?? 0
      : agent.id === 'promotion'
        ? a.weekPosts ?? 0
        : a.weekSightings ?? 0;

  const totalCount =
    agent.id === 'image-matching'
      ? a.totalMatches ?? 0
      : agent.id === 'promotion'
        ? a.totalPosts ?? 0
        : a.totalSightings ?? 0;

  const lastActiveText = a.lastActiveAt
    ? t('team.activity.lastActive', { time: formatTimeAgo(a.lastActiveAt, i18n.language as 'ko' | 'en' | 'ja' | 'zh-TW') })
    : t('team.activity.idle');

  const isActive = a.lastActiveAt && (Date.now() - new Date(a.lastActiveAt).getTime()) < 3600_000;

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between">
        {loading ? (
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
        ) : (
          <span className="text-sm font-semibold text-gray-900">{todayLabel}</span>
        )}
        {loading ? (
          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
            {lastActiveText}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-3 w-36 bg-gray-200 rounded animate-pulse" />
      ) : (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{t('team.activity.weekCount', { count: weekCount })}</span>
          <span className="text-gray-300">·</span>
          <span>{t('team.activity.totalCount', { count: totalCount })}</span>
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  const { t } = useTranslation();
  const [sponsors, setSponsors] = useState<SponsorPublic[]>([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(true);
  const [totals, setTotals] = useState<AgentTotals>({});
  const [totalsLoading, setTotalsLoading] = useState(true);
  const [activity, setActivity] = useState<AgentActivityMap>({});
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    api
      .get<SponsorPublic[]>('/sponsors?limit=20')
      .then((res) => setSponsors(Array.isArray(res) ? res : []))
      .catch(() => setSponsors([]))
      .finally(() => setSponsorsLoading(false));
    api
      .get<AgentTotals>('/sponsors/totals')
      .then((res) => setTotals(res ?? {}))
      .catch(() => {})
      .finally(() => setTotalsLoading(false));
    api
      .get<AgentActivityMap>('/agents/activity')
      .then((res) => setActivity(res ?? {}))
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, []);

  const agentNameMap = useMemo(() => {
    const map: Record<string, { nameKey: string; iconColor: string }> = {};
    for (const a of AGENTS) map[a.id] = { nameKey: a.nameKey, iconColor: a.iconColor };
    return map;
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* 헤딩 */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">{t('team.title')}</h1>
        <p className="text-gray-500 text-lg">{t('team.desc')}</p>
      </div>

      {/* 에이전트 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          return (
            <div
              key={agent.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${agent.iconBg}`}>
                  <Icon className={`w-6 h-6 ${agent.iconColor}`} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{t(agent.nameKey)}</p>
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${agent.badgeBg} ${agent.badgeText}`}
                  >
                    {t(agent.roleKey)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">{t(agent.descKey)}</p>

              {/* ERC-8004 On-chain Identity */}
              <a
                href={`${BASESCAN_NFT_URL}/${agent.onchainId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
              >
                <span className="text-xs font-mono text-gray-400">ERC-8004</span>
                <span className="text-sm font-semibold text-gray-700">#{agent.onchainId}</span>
                <span className="text-[10px] text-gray-400 truncate hidden sm:inline" title={agent.wallet}>
                  {agent.wallet.slice(0, 6)}...{agent.wallet.slice(-4)}
                </span>
                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 ml-auto shrink-0" />
              </a>

              {/* 활동 통계 */}
              <ActivitySection agent={agent} activity={activity[agent.id]} loading={activityLoading} />

              <div className="text-center py-2 px-3 bg-primary-50 rounded-lg">
                <p className="text-xs text-gray-500">{t('sponsor.totalReceived')}</p>
                {totalsLoading ? (
                  <div className="h-7 w-24 mx-auto bg-gray-200 rounded animate-pulse" />
                ) : (
                  <p className="text-lg font-bold text-primary-600">
                    {(() => {
                      const total = totals[agent.id];
                      const parts: string[] = [];
                      if (total?.krw && total.krw > 0) parts.push(`${total.krw.toLocaleString()}${t('sponsor.currencyKrw')}`);
                      if (total?.usdCents && total.usdCents > 0) parts.push(`$${(total.usdCents / 100).toLocaleString()}`);
                      return parts.length > 0 ? parts.join(' + ') : '$0';
                    })()}
                  </p>
                )}
              </div>
              <Link
                to={`/team/sponsor/${agent.id}`}
                className="inline-flex items-center justify-center gap-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <Heart className="w-4 h-4" aria-hidden="true" />
                {t('sponsor.title', { name: t(agent.nameKey) })}
              </Link>
            </div>
          );
        })}
      </div>

      {/* 후원자 목록 */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-6">{t('sponsor.sponsorList')}</h2>
        {sponsorsLoading ? (
          <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <SponsorItemSkeleton key={i} />
            ))}
          </ul>
        ) : sponsors.length === 0 ? (
          <p className="text-center text-gray-500 py-8">{t('sponsor.noSponsors')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {sponsors.map((sponsor) => (
              <li key={sponsor.id} className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {sponsor.displayName ?? t('sponsor.anonymous')}
                    </span>
                    <span className="text-primary-600 font-semibold text-sm">
                      {sponsor.currency === 'USD_CENTS'
                        ? `$${(sponsor.amount / 100).toLocaleString()}`
                        : t('sponsor.amount', { amount: sponsor.amount.toLocaleString() })}
                    </span>
                    {agentNameMap[sponsor.agentId] && (
                      <span className="text-xs text-gray-400">
                        → {t(agentNameMap[sponsor.agentId].nameKey)}
                      </span>
                    )}
                  </div>
                  {sponsor.message && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{sponsor.message}</p>
                  )}
                </div>
                <time className="text-xs text-gray-400 shrink-0 mt-1">
                  {new Date(sponsor.createdAt).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
