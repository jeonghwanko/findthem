import { useTranslation } from 'react-i18next';
import { Bot, Activity } from 'lucide-react';
import type { AgentActivityAgent } from '@findthem/shared';
import { formatTimeAgo, type Locale } from '@findthem/shared';

interface Props {
  agents: AgentActivityAgent[];
  isLoading: boolean;
}

const AGENT_LABELS: Record<string, { icon: string; colorClass: string }> = {
  'image-matching': { icon: '🔍', colorClass: 'bg-blue-50 border-blue-200 text-blue-700' },
  'promotion': { icon: '📣', colorClass: 'bg-orange-50 border-orange-200 text-orange-700' },
  'chatbot-alert': { icon: '📋', colorClass: 'bg-green-50 border-green-200 text-green-700' },
};

export default function AgentActivityOverlay({ agents, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;

  if (isLoading || agents.length === 0) return null;

  return (
    <div className="absolute bottom-2 left-2 right-2 flex gap-1.5 pointer-events-none">
      {agents.map((agent) => {
        const cfg = AGENT_LABELS[agent.agentId];
        if (!cfg) return null;

        return (
          <div
            key={agent.agentId}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs backdrop-blur-sm bg-white/80 ${cfg.colorClass} pointer-events-auto`}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <span>{cfg.icon}</span>
              <span className="font-semibold truncate">
                {t(`agentScene.${agent.agentId === 'image-matching' ? 'claude' : agent.agentId === 'promotion' ? 'heimi' : 'ali'}.name`)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] opacity-75">
              <span>
                <Bot className="w-3 h-3 inline mr-0.5" />
                {agent.todayPosts}{t('agentScene.stats.posts')}
              </span>
              <span>
                <Activity className="w-3 h-3 inline mr-0.5" />
                {agent.todayDecisions}{t('agentScene.stats.decisions')}
              </span>
            </div>
            {agent.latestPost && (
              <p className="text-[10px] mt-0.5 truncate opacity-60">
                {formatTimeAgo(agent.latestPost.createdAt, locale)} — {agent.latestPost.title}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
