import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import PhotoUpload from '../components/PhotoUpload';

function nowLocalISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function SightingSubmitPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get('reportId') || '';

  // Form state
  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [sightedAt, setSightedAt] = useState(nowLocalISO());
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [tipsterName, setTipsterName] = useState('');
  const [tipsterPhone, setTipsterPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10_000, enableHighAccuracy: true },
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (photos.length === 0) {
      setError(t('sighting.photoRequired'));
      return;
    }
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
      if (lat !== null) data.lat = lat;
      if (lng !== null) data.lng = lng;
      if (tipsterName) data.tipsterName = tipsterName;
      if (tipsterPhone) data.tipsterPhone = tipsterPhone;
      if (!user && editPassword) data.editPassword = editPassword;

      formData.append('data', JSON.stringify(data));
      await api.post('/sightings', formData);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sighting.submitError'));
    } finally {
      setLoading(false);
    }
  }

  // 제출 완료 화면
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('sighting.successTitle')}</h1>
        <p className="text-gray-500 mb-6 leading-relaxed">{t('sighting.successDesc')}</p>
        <button
          type="button"
          onClick={() => navigate(reportId ? `/reports/${reportId}` : '/')}
          className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
        >
          {t('sighting.goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">{t('sighting.title')}</h1>
      <p className="text-gray-500 text-sm mb-6">{t('sighting.subtitle')}</p>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
        {/* 1. 사진 (필수) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Camera className="w-4 h-4" />
            {t('sighting.photoLabel')} <span className="text-red-500">*</span>
          </label>
          <PhotoUpload maxFiles={5} onChange={setPhotos} />
          <p className="text-xs text-gray-400 mt-1">{t('sighting.photoHint')}</p>
        </div>

        {/* 2. 위치 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <MapPin className="w-4 h-4" />
            {t('sighting.sightedPlace')} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
              placeholder={t('sighting.sightedPlacePlaceholder')}
              required
            />
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
            >
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {t('sighting.useMyLocation')}
            </button>
          </div>
          {lat !== null && lng !== null && (
            <p className="text-xs text-green-600 mt-1">
              GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          )}
        </div>

        {/* 3. 날짜/시간 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('sighting.sightedAt')} <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={sightedAt}
            onChange={(e) => setSightedAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
            required
          />
        </div>

        {/* 4. 설명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('sighting.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none text-sm"
            placeholder={t('sighting.descriptionPlaceholder')}
            required
          />
        </div>

        {/* 5. 제보자 정보 (선택) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sighting.tipsterName')}
            </label>
            <input
              value={tipsterName}
              onChange={(e) => setTipsterName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sighting.tipsterPhone')}
            </label>
            <input
              type="tel"
              value={tipsterPhone}
              onChange={(e) => setTipsterPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
              placeholder="01012345678"
            />
          </div>
        </div>

        {/* 6. 비회원 비밀번호 */}
        {!user && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-amber-800 mb-1">
              {t('sighting.passwordLabel')}
            </label>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              placeholder={t('sighting.passwordPlaceholder')}
              minLength={4}
            />
            <p className="text-xs text-amber-600 mt-1">{t('sighting.passwordHint')}</p>
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || photos.length === 0 || !description || !sightedAt || !address}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? t('sighting.submitting') : t('sighting.submit')}
        </button>
      </form>
    </div>
  );
}
