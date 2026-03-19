import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin, Loader2, CheckCircle, ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import PhotoUpload from '../components/PhotoUpload';
import type { PhotoExifData } from '../components/PhotoUpload';
import { reverseGeocode } from '../hooks/useKakaoMap';

function toLocalISO(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

interface AddressOption {
  address: string;
  lat: number;
  lng: number;
  photoIndex: number;
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
  const [sightedAt, setSightedAt] = useState(toLocalISO(new Date()));
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState('');

  // EXIF auto-fill tracking
  const exifAppliedRef = useRef(false);
  const exifSessionRef = useRef(0); // 사진 전체 삭제 시 증가 → stale 응답 차단
  const [exifMessage, setExifMessage] = useState('');
  const exifTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Multi-address options from photo EXIF
  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);

  const showExifMessage = useCallback((fields: string[]) => {
    clearTimeout(exifTimerRef.current);
    setExifMessage(t('sighting.exifApplied', { fields: fields.join(', ') }));
    exifTimerRef.current = setTimeout(() => setExifMessage(''), 5000);
  }, [t]);

  // Cleanup exif timer on unmount
  useEffect(() => () => { clearTimeout(exifTimerRef.current); }, []);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleExifExtracted = useCallback((exif: PhotoExifData) => {
    if (exifAppliedRef.current) return;
    exifAppliedRef.current = true;

    // GPS 좌표 즉시 반영 (주소 변환은 handleEachExif가 담당)
    if (exif.lat != null && exif.lng != null) {
      setLat(exif.lat);
      setLng(exif.lng);
    }

    const parts: string[] = [];
    if (exif.lat != null) parts.push(t('sighting.exifGps'));
    if (exif.takenAt) {
      setSightedAt(toLocalISO(new Date(exif.takenAt)));
      parts.push(t('sighting.exifTime'));
    }

    if (parts.length > 0) {
      showExifMessage(parts);
    }
  }, [t, showExifMessage]);

  const handleEachExif = useCallback((exif: PhotoExifData, fileIndex: number) => {
    if (exif.lat == null || exif.lng == null) return;
    const exifLat = exif.lat;
    const exifLng = exif.lng;
    const session = exifSessionRef.current;
    void reverseGeocode(exifLat, exifLng).then((addr) => {
      if (!addr || session !== exifSessionRef.current) return; // stale 응답 무시
      const option: AddressOption = { address: addr, lat: exifLat, lng: exifLng, photoIndex: fileIndex };
      setAddressOptions((prev) => {
        if (prev.some((o) => o.address === addr)) return prev;
        return [...prev, option];
      });
    });
  }, []);

  // 첫 번째 주소 옵션이 추가되면 자동 선택
  const prevOptionsLenRef = useRef(0);
  useEffect(() => {
    if (prevOptionsLenRef.current === 0 && addressOptions.length === 1) {
      const first = addressOptions[0];
      setAddress(first.address);
      setLat(first.lat);
      setLng(first.lng);
      showExifMessage([t('sighting.exifGps'), t('sighting.exifAddress')]);
    }
    prevOptionsLenRef.current = addressOptions.length;
  }, [addressOptions, t, showExifMessage]);

  const handleAddressSelect = useCallback((value: string) => {
    if (value === '__manual__') {
      setAddress('');
      setLat(null);
      setLng(null);
      return;
    }
    const option = addressOptions.find((o) => o.address === value);
    if (option) {
      setAddress(option.address);
      setLat(option.lat);
      setLng(option.lng);
    }
  }, [addressOptions]);

  const handlePhotosChange = useCallback((files: File[]) => {
    setPhotos(files);
    if (files.length === 0) {
      setAddressOptions([]);
      exifAppliedRef.current = false;
      exifSessionRef.current += 1; // stale reverseGeocode 응답 차단
    }
  }, []);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        setLocating(false);

        // GPS → 주소 자동 채우기
        void reverseGeocode(latitude, longitude).then((addr) => {
          if (addr) setAddress(addr);
        });
      },
      () => setLocating(false),
      { timeout: 10_000, enableHighAccuracy: true },
    );
  }, []);

  const isSubmittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (photos.length === 0) {
      setError(t('sighting.photoRequired'));
      return;
    }
    if (!sightedAt || isNaN(new Date(sightedAt).getTime())) {
      setError(t('sighting.submitError'));
      return;
    }
    if (!user && editPassword && editPassword.length < 4) {
      setError(t('sighting.submitError'));
      return;
    }
    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      photos.forEach((file) => formData.append('photos', file));

      const data: Record<string, unknown> = {
        sightedAt: new Date(sightedAt).toISOString(),
      };
      if (description) data.description = description;
      if (address) data.address = address;
      if (reportId) data.reportId = reportId;
      if (lat !== null) data.lat = lat;
      if (lng !== null) data.lng = lng;
      if (!user && editPassword) data.editPassword = editPassword;

      formData.append('data', JSON.stringify(data));
      await api.post('/sightings', formData);
      setSubmitted(true);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('sighting.submitError') }));
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
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

  const hasMultiAddr = addressOptions.length >= 2;
  const isAddrFromOptions = hasMultiAddr && addressOptions.some((o) => o.address === address);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">{t('sighting.title')}</h1>
      <p className="text-gray-500 text-sm mb-6">{t('sighting.subtitle')}</p>

      <form onSubmit={(e) => { void handleSubmit(e); }} autoComplete="off" className="space-y-5">
        {/* 1. 사진 (필수, 최상단) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Camera className="w-4 h-4" />
            {t('sighting.photoLabel')} <span className="text-red-500">*</span>
          </label>
          <PhotoUpload
            maxFiles={5}
            onChange={handlePhotosChange}
            onExifExtracted={handleExifExtracted}
            onEachExif={handleEachExif}
          />
          <p className="text-xs text-gray-400 mt-1">{t('sighting.photoHint')}</p>

          {exifMessage && (
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              {exifMessage}
            </p>
          )}
        </div>

        {/* 2. 위치 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <MapPin className="w-4 h-4" />
            {t('sighting.sightedPlace')}
          </label>
          {hasMultiAddr && (
            <div className="relative mb-2">
              <select
                value={isAddrFromOptions ? address : '__manual__'}
                onChange={(e) => handleAddressSelect(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm appearance-none bg-white"
              >
                {addressOptions.map((o, i) => (
                  <option key={i} value={o.address}>
                    {t('sighting.photoN', { n: o.photoIndex + 1 })}: {o.address}
                  </option>
                ))}
                <option value="__manual__">{t('sighting.manualInput')}</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}
          {(!hasMultiAddr || !isAddrFromOptions) && (
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                placeholder={t('sighting.sightedPlacePlaceholder')}
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
          )}
          {lat !== null && lng !== null && (
            <p className="text-xs text-green-600 mt-1">
              GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          )}
        </div>

        {/* 3. 날짜/시간 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('sighting.sightedAt')}
          </label>
          <input
            type="datetime-local"
            value={sightedAt}
            onChange={(e) => setSightedAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          />
        </div>

        {/* 4. 설명 (선택) */}
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
          />
        </div>

        {/* 5. 비회원 비밀번호 */}
        {!user && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-amber-800 mb-1">
              {t('sighting.passwordLabel')}
            </label>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              autoComplete="new-password"
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
          disabled={loading || photos.length === 0}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? t('sighting.submitting') : t('sighting.submit')}
        </button>
      </form>
    </div>
  );
}
