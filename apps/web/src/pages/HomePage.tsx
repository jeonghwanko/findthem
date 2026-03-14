import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, Report, ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';

export default function HomePage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ReportListResponse>('/reports?limit=8')
      .then((data) => setReports(data.reports))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-600 to-primary-700 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">
            {t('home.heroTitle')}
          </h1>
          <p className="text-primary-200 text-lg mb-8">
            {t('home.heroDesc')}
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              to="/reports/new"
              className="bg-accent-500 hover:bg-accent-600 text-white px-6 py-3 rounded-xl font-semibold text-lg transition-colors"
            >
              {t('home.newReport')}
            </Link>
            <Link
              to="/browse"
              className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl font-semibold text-lg transition-colors"
            >
              {t('home.submitSighting')}
            </Link>
          </div>
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6 rounded-xl bg-blue-50">
            <div className="text-4xl mb-3">📢</div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.featurePromo')}</h3>
            <p className="text-sm text-gray-600">
              {t('home.featurePromoDesc')}
            </p>
          </div>
          <div className="text-center p-6 rounded-xl bg-green-50">
            <div className="text-4xl mb-3">💬</div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.featureChatbot')}</h3>
            <p className="text-sm text-gray-600">
              {t('home.featureChatbotDesc')}
            </p>
          </div>
          <div className="text-center p-6 rounded-xl bg-purple-50">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('home.featureMatching')}</h3>
            <p className="text-sm text-gray-600">
              {t('home.featureMatchingDesc')}
            </p>
          </div>
        </div>
      </section>

      {/* 최근 실종 신고 */}
      <section className="max-w-5xl mx-auto px-4 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('home.recentReports')}</h2>
          <Link to="/browse" className="text-primary-600 hover:text-primary-700 font-medium">
            {t('home.viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">{t('loading')}</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {t('home.noReports')}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
