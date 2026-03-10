import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import PhotoUpload from '../components/PhotoUpload';

export default function SightingSubmitPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get('reportId') || '';

  const [description, setDescription] = useState('');
  const [sightedAt, setSightedAt] = useState('');
  const [address, setAddress] = useState('');
  const [tipsterName, setTipsterName] = useState('');
  const [tipsterPhone, setTipsterPhone] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      photos.forEach((file) => formData.append('photos', file));

      const data: Record<string, unknown> = {
        description,
        sightedAt: new Date(sightedAt).toISOString(),
        address,
      };
      if (reportId) data.reportId = reportId;
      if (tipsterName) data.tipsterName = tipsterName;
      if (tipsterPhone) data.tipsterPhone = tipsterPhone;

      formData.append('data', JSON.stringify(data));
      await api.post('/sightings', formData);

      if (reportId) {
        navigate(`/reports/${reportId}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || '제보에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">목격 제보</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            사진 (선택)
          </label>
          <PhotoUpload maxFiles={5} onChange={setPhotos} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목격 내용 *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            placeholder="어디서 무엇을 목격하셨나요? 가능한 상세히 적어주세요."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목격 일시 *
          </label>
          <input
            type="datetime-local"
            value={sightedAt}
            onChange={(e) => setSightedAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목격 장소 *
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="서울시 강남구 역삼동 스타벅스 앞"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제보자 이름 (선택)
            </label>
            <input
              value={tipsterName}
              onChange={(e) => setTipsterName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              연락처 (선택)
            </label>
            <input
              type="tel"
              value={tipsterPhone}
              onChange={(e) => setTipsterPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="01012345678"
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !description || !sightedAt || !address}
          className="w-full bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? '제출 중...' : '제보 제출'}
        </button>
      </form>
    </div>
  );
}
