import { useTranslation } from 'react-i18next';

interface StatsStripProps {
  stats: { total: number; found: number } | null;
  recoveryRate: number | null;
}

export default function StatsStrip({ stats, recoveryRate }: StatsStripProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-around bg-indigo-700 border border-indigo-600 rounded-xl px-2 py-1.5 shadow-md divide-x divide-indigo-500/50 whitespace-nowrap">
      <div className="px-5 py-1.5 text-center">
        {stats ? <p className="text-lg font-bold text-white tabular-nums">{stats.total.toLocaleString()}</p> : <div className="h-5 w-10 mx-auto bg-indigo-500 rounded animate-pulse" />}
        <p className="text-xs font-medium text-indigo-200">{t('home.statTotal')}</p>
      </div>
      <div className="px-5 py-1.5 text-center">
        {stats ? <p className="text-lg font-bold text-amber-300 tabular-nums">{stats.found.toLocaleString()}</p> : <div className="h-5 w-8 mx-auto bg-indigo-500 rounded animate-pulse" />}
        <p className="text-xs font-medium text-indigo-200">{t('home.statFound')}</p>
      </div>
      <div className="px-5 py-1.5 text-center">
        {recoveryRate !== null ? <p className="text-lg font-bold text-emerald-300 tabular-nums">{recoveryRate}%</p> : <div className="h-5 w-8 mx-auto bg-indigo-500 rounded animate-pulse" />}
        <p className="text-xs font-medium text-indigo-200">{t('home.statRate')}</p>
      </div>
    </div>
  );
}
