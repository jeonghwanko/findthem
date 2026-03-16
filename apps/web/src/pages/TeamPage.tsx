import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanFace, Megaphone, MessageSquare, Heart } from 'lucide-react';
import { api, type SponsorPublic, type AgentId } from '../api/client';

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
}

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
  },
];

interface SponsorListResponse {
  sponsors: SponsorPublic[];
}

export default function TeamPage() {
  const { t } = useTranslation();
  const [sponsors, setSponsors] = useState<SponsorPublic[]>([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(true);

  useEffect(() => {
    api
      .get<SponsorListResponse>('/sponsors?limit=20')
      .then((res) => setSponsors(res.sponsors))
      .catch(() => setSponsors([]))
      .finally(() => setSponsorsLoading(false));
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
              <Link
                to={`/team/sponsor/${agent.id}`}
                className="inline-flex items-center justify-center gap-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <Heart className="w-4 h-4" aria-hidden="true" />
                {t('team.agentImageMatching.name') === t(agent.nameKey)
                  ? t('sponsor.title', { name: t(agent.nameKey) })
                  : t('sponsor.title', { name: t(agent.nameKey) })}
              </Link>
            </div>
          );
        })}
      </div>

      {/* 후원자 목록 */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-6">{t('sponsor.sponsorList')}</h2>
        {sponsorsLoading ? (
          <div className="text-center py-8 text-gray-400">{t('loading')}</div>
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
                      {t('sponsor.amount', { amount: sponsor.amount.toLocaleString() })}
                    </span>
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
