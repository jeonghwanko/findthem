import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ExternalLink, Gamepad2, ChevronDown, Maximize2, Minimize2, Search } from 'lucide-react';
import { formatTimeAgo } from '@findthem/shared';
import { api, type SponsorPublic, type AgentId } from '../api/client';
import { SponsorItemSkeleton } from '../components/Skeleton';
import { AGENT_SKINS } from '../constants/agentSkins';
import AgentActivityScene from '../components/AgentActivityScene';
import FindThemGame from '../components/findgame/FindThemGame';

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
  skins: readonly string[];
  folkId: number;
  iconBg: string;
  portraitBorder: string;
  badgeBg: string;
  badgeText: string;
  onchainId: string;
  wallet: string;
  colorBar: string;
  agentImg: string;
  activityBg: string;
  primaryColor: string;
  sponsorGradient: string;
}

/** 32x32folk.png에서 특정 캐릭터의 정면(down) 첫 프레임을 CSS로 표시 */
function FolkPortrait({ folkId, size = 48 }: { folkId: number; size?: number }) {
  const col = ((folkId - 1) % 4);
  const row = Math.floor((folkId - 1) / 4);
  const bgX = col * 96;
  const bgY = row * 128;
  const scale = size / 32;

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundImage: 'url(/tiles/32x32folk.png)',
        backgroundPosition: `-${bgX * scale}px -${bgY * scale}px`,
        backgroundSize: `${384 * scale}px ${256 * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

const BASESCAN_NFT_URL = 'https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

const AGENTS: AgentConfig[] = [
  {
    id: 'image-matching',
    nameKey: 'team.agentImageMatching.name',
    roleKey: 'team.agentImageMatching.role',
    descKey: 'team.agentImageMatching.desc',
    skins: AGENT_SKINS['image-matching'],
    folkId: 1,
    iconBg: 'bg-blue-50',
    portraitBorder: '#818cf8',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    onchainId: '32501',
    wallet: '0xAd7714D358DC67Dc5491b8B7152f1a056F49C089',
    colorBar: 'bg-indigo-400',
    agentImg: '/agents/image-matching.webp',
    activityBg: 'bg-indigo-50/50',
    primaryColor: 'text-indigo-600',
    sponsorGradient: 'from-indigo-50',
  },
  {
    id: 'promotion',
    nameKey: 'team.agentPromotion.name',
    roleKey: 'team.agentPromotion.role',
    descKey: 'team.agentPromotion.desc',
    skins: AGENT_SKINS['promotion'],
    folkId: 6,
    iconBg: 'bg-pink-50',
    portraitBorder: '#f472b6',
    badgeBg: 'bg-pink-50',
    badgeText: 'text-pink-700',
    onchainId: '32502',
    wallet: '0xB192B0d602fcd9392e81DF375e25888fB029ff2A',
    colorBar: 'bg-pink-400',
    agentImg: '/agents/promotion.webp',
    activityBg: 'bg-pink-50/50',
    primaryColor: 'text-pink-600',
    sponsorGradient: 'from-pink-50',
  },
  {
    id: 'chatbot-alert',
    nameKey: 'team.agentChatbotAlert.name',
    roleKey: 'team.agentChatbotAlert.role',
    descKey: 'team.agentChatbotAlert.desc',
    skins: AGENT_SKINS['chatbot-alert'],
    folkId: 3,
    iconBg: 'bg-green-50',
    portraitBorder: '#4ade80',
    badgeBg: 'bg-green-50',
    badgeText: 'text-green-700',
    onchainId: '32503',
    wallet: '0xB6B02dbd3957791710Dc226d264d0184c40EB94d',
    colorBar: 'bg-green-400',
    agentImg: '/agents/chatbot-alert.webp',
    activityBg: 'bg-green-50/50',
    primaryColor: 'text-green-600',
    sponsorGradient: 'from-green-50',
  },
];

/** 에이전트 ID로 colorBar 클래스를 반환 */
function getAgentColorBar(agentId: string): string {
  const agent = AGENTS.find((a) => a.id === agentId);
  return agent?.colorBar ?? 'bg-gray-300';
}

function ActivitySection({
  agent,
  activity,
  loading,
}: {
  agent: AgentConfig;
  activity: AgentActivity | undefined;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();

  const a = activity ?? ({} as Partial<AgentActivity>);

  const todayCount =
    agent.id === 'image-matching'
      ? a.todayMatches ?? 0
      : agent.id === 'promotion'
        ? a.todayPosts ?? 0
        : a.todaySightings ?? 0;

  const todayUnitKey =
    agent.id === 'image-matching'
      ? 'team.activity.unitMatches'
      : agent.id === 'promotion'
        ? 'team.activity.unitPosts'
        : 'team.activity.unitSightings';

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
    ? t('team.activity.lastActive', {
        time: formatTimeAgo(a.lastActiveAt, i18n.language as 'ko' | 'en' | 'ja' | 'zh-TW'),
      })
    : t('team.activity.idle');

  const isActive =
    a.lastActiveAt && Date.now() - new Date(a.lastActiveAt).getTime() < 3600_000;

  return (
    <div className={`${agent.activityBg} rounded-lg px-3 py-2.5 space-y-1.5`}>
      <div className="flex items-start justify-between gap-2">
        {loading ? (
          <div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${agent.primaryColor}`}>{todayCount}</span>
            <span className="text-sm text-gray-500">{t(todayUnitKey)}</span>
          </div>
        )}
        {loading ? (
          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
            <span className="relative w-1.5 h-1.5">
              {isActive && (
                <span className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-75" />
              )}
              <span className={`absolute inset-0 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
            </span>
            <span className={isActive ? 'text-green-600 font-medium' : ''}>
              {isActive ? t('team.activity.active') : lastActiveText}
            </span>
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-3 w-36 bg-gray-200 rounded animate-pulse" />
      ) : (
        <div className="flex items-center gap-2 text-xs text-gray-400">
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
  const [sceneExpanded, setSceneExpanded] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [findGameOpen, setFindGameOpen] = useState(false);

  // 씬 확장 시 body 스크롤 방지 + viewport 높이 추적
  useEffect(() => {
    if (!sceneExpanded) return;
    document.body.style.overflow = 'hidden';
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('resize', onResize);
    };
  }, [sceneExpanded]);

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
    const map: Record<string, { nameKey: string }> = {};
    for (const a of AGENTS) map[a.id] = { nameKey: a.nameKey };
    return map;
  }, []);

  const agentCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToAgent = (agentId: string) => {
    const el = agentCardRefs.current[agentId];
    if (!el) return;
    const headerOffset = 80;
    const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // 임팩트 수치 집계
  const totalMatches = Object.values(activity).reduce(
    (sum, a) => sum + (a.totalMatches ?? 0),
    0,
  );
  const totalPosts = Object.values(activity).reduce(
    (sum, a) => sum + (a.totalPosts ?? 0),
    0,
  );
  const totalSponsorUsd = Object.values(totals).reduce(
    (sum, v) => sum + (v.usdCents ?? 0),
    0,
  );
  const totalSponsorKrw = Object.values(totals).reduce(
    (sum, v) => sum + (v.krw ?? 0),
    0,
  );

  return (
    <div className="bg-white">
      {/* Pixi 타일맵 씬 + 에이전트 HUD 오버레이 */}
      <div className={`relative transition-all duration-300 ${
        sceneExpanded
          ? 'fixed inset-0 z-50 bg-[#f5f0e8] overflow-auto'
          : 'h-[320px] md:h-[480px] overflow-hidden'
      }`}>
        <AgentActivityScene key={sceneExpanded ? 'expanded' : 'normal'} height={sceneExpanded ? viewportHeight : undefined} />

        {/* 확장/축소 버튼 */}
        <button
          type="button"
          onClick={() => setSceneExpanded((v) => !v)}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1.5 rounded-full hover:bg-black/70 transition-colors"
          aria-label={sceneExpanded ? t('team.sceneCollapse') : t('team.sceneExpand')}
        >
          {sceneExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          {sceneExpanded ? t('team.sceneCollapse') : t('team.sceneExpand')}
        </button>

        {/* 에이전트 썸네일 HUD (씬 중앙 상단, 축소 모드에서만) */}
        {!sceneExpanded && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => scrollToAgent(agent.id)}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/55 hover:scale-105 transition-all cursor-pointer border border-white/20"
              >
                <FolkPortrait folkId={agent.folkId} size={40} />
                <span className="text-[10px] font-bold text-white whitespace-nowrap drop-shadow-sm">
                  {t(agent.nameKey)}
                </span>
                <ChevronDown className="w-3 h-3 text-white/60" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {/* 게임 버튼 그룹 (씬 우하단) */}
        <div className={`absolute z-10 flex flex-col gap-2 ${
          sceneExpanded ? 'right-3 bottom-3' : 'right-3 bottom-12'
        }`}>
          {/* 숨은 에이전트 찾기 미니게임 */}
          <button
            type="button"
            onClick={() => setFindGameOpen(true)}
            className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-indigo-300 via-indigo-400 to-indigo-500 text-indigo-950 font-bold shadow-[0_6px_0_0_#3730a3,0_8px_20px_rgba(55,48,163,0.35)] hover:shadow-[0_3px_0_0_#3730a3,0_5px_14px_rgba(55,48,163,0.35)] hover:translate-y-[3px] active:shadow-[0_0px_0_0_#3730a3] active:translate-y-[6px] transition-all duration-100 px-5 py-3"
          >
            <Search className="w-6 h-6 drop-shadow-sm" aria-hidden="true" />
            <span className="text-xs">{t('findGame.playButton')}</span>
          </button>
          {/* 계단 게임 */}
          <Link
            to="/game"
            className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-amber-900 font-bold shadow-[0_6px_0_0_#b45309,0_8px_20px_rgba(180,83,9,0.35)] hover:shadow-[0_3px_0_0_#b45309,0_5px_14px_rgba(180,83,9,0.35)] hover:translate-y-[3px] active:shadow-[0_0px_0_0_#b45309] active:translate-y-[6px] transition-all duration-100 px-5 py-3"
          >
            <Gamepad2 className="w-6 h-6 drop-shadow-sm" aria-hidden="true" />
            <span className="text-xs">{t('home.playToSponsor')}</span>
          </Link>
        </div>

        {/* 하단 그라데이션 페이드 + 설명 텍스트 (축소 모드에서만) */}
        {!sceneExpanded && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />
            <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center pointer-events-none">
              <span className="text-xs text-gray-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full">
                {t('team.sceneLive')}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-8 pb-6">
        {/* 헤딩 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {t('team.title')}
          </h1>
          <p className="text-gray-500 text-lg">{t('team.desc')}</p>

          {/* 임팩트 수치 밴드 */}
          <div className="flex justify-center gap-8 md:gap-12 mt-6">
            <div className="flex flex-col items-center gap-0.5">
              {activityLoading ? (
                <div className="h-7 w-16 bg-gray-200 rounded animate-pulse" />
              ) : (
                <span className="text-2xl font-bold text-indigo-600">
                  {totalMatches.toLocaleString()}
                </span>
              )}
              <span className="text-xs text-gray-400">{t('team.impactMatches')}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {activityLoading ? (
                <div className="h-7 w-16 bg-gray-200 rounded animate-pulse" />
              ) : (
                <span className="text-2xl font-bold text-pink-600">
                  {totalPosts.toLocaleString()}
                </span>
              )}
              <span className="text-xs text-gray-400">{t('team.impactPosts')}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {totalsLoading ? (
                <div className="h-7 w-16 bg-gray-200 rounded animate-pulse" />
              ) : (
                <span className="text-2xl font-bold text-green-600">
                  {totalSponsorUsd > 0
                    ? `$${(totalSponsorUsd / 100).toLocaleString()}`
                    : totalSponsorKrw > 0
                      ? `${totalSponsorKrw.toLocaleString()}${t('sponsor.currencyKrw')}`
                      : '$0'}
                </span>
              )}
              <span className="text-xs text-gray-400">{t('team.impactSponsors')}</span>
            </div>
          </div>
        </div>

        {/* 에이전트 카드 그리드 */}
        <div
          className="rounded-2xl p-4 md:p-6 mb-16"
          style={{
            backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AGENTS.map((agent) => {
            const agentTotals = totals[agent.id];
            const totalAmount = (() => {
              const parts: string[] = [];
              if (agentTotals?.krw && agentTotals.krw > 0)
                parts.push(`${agentTotals.krw.toLocaleString()}${t('sponsor.currencyKrw')}`);
              if (agentTotals?.usdCents && agentTotals.usdCents > 0)
                parts.push(`$${(agentTotals.usdCents / 100).toLocaleString()}`);
              return parts.length > 0 ? parts.join(' + ') : null;
            })();

            const agentActivity = activity[agent.id];
            const totalCount =
              agent.id === 'image-matching'
                ? agentActivity?.totalMatches ?? 0
                : agent.id === 'promotion'
                  ? agentActivity?.totalPosts ?? 0
                  : agentActivity?.totalSightings ?? 0;

            const level = Math.max(1, Math.floor(Math.log2(totalCount + 1)));

            return (
              <div
                key={agent.id}
                ref={(el) => {
                  agentCardRefs.current[agent.id] = el;
                }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col relative"
              >
                {/* 상단 컬러 헤더 밴드 */}
                <div className={`h-1.5 rounded-t-2xl ${agent.colorBar}`} />

                {/* 레벨 뱃지 */}
                <div className="absolute top-5 right-3 text-xs font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded">
                  {t('team.level', { level })}
                </div>

                <div className="p-6 flex flex-col gap-4 flex-1">
                  {/* 아바타 + 이름 */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center shrink-0 ${agent.iconBg}`}
                      style={{ border: `2px solid ${agent.portraitBorder}` }}
                    >
                      <FolkPortrait folkId={agent.folkId} size={64} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{t(agent.nameKey)}</p>
                        {/* 에이전트 webp 이미지 */}
                        <img
                          src={agent.agentImg}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover border border-white shadow-sm"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${agent.badgeBg} ${agent.badgeText}`}
                      >
                        {t(agent.roleKey)}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed flex-1">{t(agent.descKey)}</p>

                  {/* 활동 통계 */}
                  <ActivitySection
                    agent={agent}
                    activity={agentActivity}
                    loading={activityLoading}
                  />

                  {/* 후원 섹션 통합 */}
                  <div className={`bg-gradient-to-b ${agent.sponsorGradient} to-white rounded-xl p-4 flex flex-col gap-3`}>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">{t('sponsor.totalReceived')}</p>
                      {totalsLoading ? (
                        <div className="h-7 w-24 mx-auto bg-gray-200 rounded animate-pulse" />
                      ) : totalAmount ? (
                        <p className={`text-lg font-bold ${agent.primaryColor}`}>{totalAmount}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">{t('sponsor.beFirst')}</p>
                      )}
                    </div>
                    <Link
                      to={`/team/sponsor/${agent.id}`}
                      className="inline-flex items-center justify-center gap-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                    >
                      <Heart className="w-4 h-4" aria-hidden="true" />
                      {t('sponsor.support', { name: t(agent.nameKey) })}
                    </Link>

                    {/* ERC-8004 On-chain Identity — 후원 버튼 아래로 이동 */}
                    <a
                      href={`${BASESCAN_NFT_URL}/${agent.onchainId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 inline-flex items-center gap-1 justify-center mt-1 hover:text-gray-600 transition-colors"
                    >
                      <span>{t('team.onchainId', { id: agent.onchainId })}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {/* 후원자 목록 */}
        <div className="pb-24 md:pb-12">
          <div className="flex flex-wrap items-baseline gap-2 mb-6">
            <h2 className="text-xl font-bold text-gray-900">{t('sponsor.sponsorList')}</h2>
            {!sponsorsLoading && sponsors.length > 0 && (
              <span className="text-sm text-gray-500">
                {t('sponsor.totalSupporters', { count: sponsors.length })}
              </span>
            )}
          </div>
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
                <li key={sponsor.id} className="flex items-stretch gap-0 px-0 py-0">
                  {/* 에이전트별 컬러 사이드바 */}
                  <div className={`w-1 self-stretch rounded-l-sm flex-shrink-0 ${getAgentColorBar(sponsor.agentId)}`} />
                  <div className="flex items-start gap-4 px-5 py-4 flex-1 min-w-0">
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
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2 italic">
                          {sponsor.message}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-gray-400 shrink-0 mt-1">
                      {new Date(sponsor.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 숨은 에이전트 찾기 미니게임 모달 */}
      <FindThemGame open={findGameOpen} onClose={() => setFindGameOpen(false)} />
    </div>
  );
}
