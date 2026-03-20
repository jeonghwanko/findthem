import { useTranslation } from 'react-i18next';

interface StatsStripProps {
  stats: { total: number; found: number } | null;
  recoveryRate: number | null;
}

export default function StatsStrip({ stats, recoveryRate }: StatsStripProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-around bg-indigo-600/85 backdrop-blur-sm border border-indigo-500 rounded-xl px-1 py-0.5 shadow-sm divide-x divide-indigo-400/40 whitespace-nowrap">
      <div className="px-5 py-1.5 text-center">
        {stats ? <p className="text-base font-bold text-white tabular-nums">{stats.total.toLocaleString()}</p> : <div className="h-5 w-10 mx-auto bg-indigo-400 rounded animate-pulse" />}
        <p className="text-[10px] text-indigo-200">{t('home.statTotal')}</p>
      </div>
      <div className="px-5 py-1.5 text-center">
        {stats ? <p className="text-base font-bold text-amber-300 tabular-nums">{stats.found.toLocaleString()}</p> : <div className="h-5 w-8 mx-auto bg-indigo-400 rounded animate-pulse" />}
        <p className="text-[10px] text-indigo-200">{t('home.statFound')}</p>
      </div>
      <div className="px-5 py-1.5 text-center">
        {recoveryRate !== null ? <p className="text-base font-bold text-emerald-300 tabular-nums">{recoveryRate}%</p> : <div className="h-5 w-8 mx-auto bg-indigo-400 rounded animate-pulse" />}
        <p className="text-[10px] text-indigo-200">{t('home.statRate')}</p>
      </div>
    </div>
  );
}
