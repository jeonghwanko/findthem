import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Report, ReportListResponse } from '../api/client';
import ReportCard from '../components/ReportCard';

export default function HomePage() {
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
            잃어버린 소중한 가족을 찾아드립니다
          </h1>
          <p className="text-primary-200 text-lg mb-8">
            AI가 자동으로 SNS에 홍보하고, 목격 제보를 분석하여 매칭합니다
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              to="/reports/new"
              className="bg-accent-500 hover:bg-accent-600 text-white px-6 py-3 rounded-xl font-semibold text-lg transition-colors"
            >
              실종 신고하기
            </Link>
            <Link
              to="/browse"
              className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl font-semibold text-lg transition-colors"
            >
              목격 제보하기
            </Link>
          </div>
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6 rounded-xl bg-blue-50">
            <div className="text-4xl mb-3">📢</div>
            <h3 className="font-semibold text-gray-900 mb-2">AI 자동 홍보</h3>
            <p className="text-sm text-gray-600">
              신고 등록 시 AI가 홍보글을 생성하여 카카오톡, X 등에 자동 게시합니다
            </p>
          </div>
          <div className="text-center p-6 rounded-xl bg-green-50">
            <div className="text-4xl mb-3">💬</div>
            <h3 className="font-semibold text-gray-900 mb-2">챗봇 제보 수집</h3>
            <p className="text-sm text-gray-600">
              웹/카카오톡 챗봇으로 목격 정보를 대화하듯 쉽게 제보할 수 있습니다
            </p>
          </div>
          <div className="text-center p-6 rounded-xl bg-purple-50">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-semibold text-gray-900 mb-2">AI 이미지 매칭</h3>
            <p className="text-sm text-gray-600">
              제보된 사진과 실종 사진을 AI가 자동 비교하여 매칭 알림을 보냅니다
            </p>
          </div>
        </div>
      </section>

      {/* 최근 실종 신고 */}
      <section className="max-w-5xl mx-auto px-4 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">최근 실종 신고</h2>
          <Link to="/browse" className="text-primary-600 hover:text-primary-700 font-medium">
            전체 보기 →
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">로딩 중...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            아직 등록된 신고가 없습니다
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
