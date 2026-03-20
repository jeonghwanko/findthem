import { useTranslation } from 'react-i18next';

interface StatsStripProps {
  stats: { total: number; found: number } | null;
  recoveryRate: number | null;
}

export default function StatsStrip({ stats, recoveryRate }: StatsStripProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center rounded-xl py-1 divide-x divide-gray-300/50 whitespace-nowrap">
      <div className="flex-1 py-1 text-center">
        {stats ? <p className="text-base font-semibold text-gray-600 tabular-nums">{stats.total.toLocaleString()}</p> : <div className="h-5 w-10 mx-auto bg-gray-200 rounded animate-pulse" />}
        <p className="text-xs font-medium text-gray-400">{t('home.statTotal')}</p>
      </div>
      <div className="flex-1 py-1 text-center">
        {stats ? <p className="text-base font-semibold text-amber-500 tabular-nums">{stats.found.toLocaleString()}</p> : <div className="h-5 w-8 mx-auto bg-gray-200 rounded animate-pulse" />}
        <p className="text-xs font-medium text-gray-400">{t('home.statFound')}</p>
      </div>
      <div className="flex-1 py-1 text-center">
        {recoveryRate !== null ? <p className="text-base font-semibold text-emerald-500 tabular-nums">{recoveryRate}%</p> : <div className="h-5 w-8 mx-auto bg-gray-200 rounded animate-pulse" />}
        <p className="text-xs font-medium text-gray-400">{t('home.statRate')}</p>
      </div>
    </div>
  );
}
