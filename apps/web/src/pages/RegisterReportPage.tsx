import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { SUBJECT_TYPE_LABELS } from '@findthem/shared';
import PhotoUpload from '../components/PhotoUpload';

const SUBJECT_TYPE_ICONS: Record<string, string> = {
  PERSON: '👤',
  DOG: '🐕',
  CAT: '🐈',
};

const SUBJECT_TYPES = Object.entries(SUBJECT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
  icon: SUBJECT_TYPE_ICONS[value] || '❓',
}));

export default function RegisterReportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [subjectType, setSubjectType] = useState<string>('');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [color, setColor] = useState('');
  const [features, setFeatures] = useState('');
  const [clothingDesc, setClothingDesc] = useState('');
  const [lastSeenAt, setLastSeenAt] = useState('');
  const [lastSeenAddress, setLastSeenAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [reward, setReward] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);

  async function handleSubmit() {
    if (photos.length === 0) {
      setError('최소 1장의 사진을 등록하세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      photos.forEach((file) => formData.append('photos', file));

      const data: Record<string, unknown> = {
        subjectType,
        name,
        features,
        lastSeenAt: new Date(lastSeenAt).toISOString(),
        lastSeenAddress,
        contactPhone,
        contactName,
      };
      if (species) data.species = species;
      if (gender) data.gender = gender;
      if (age) data.age = age;
      if (color) data.color = color;
      if (clothingDesc) data.clothingDesc = clothingDesc;
      if (reward) data.reward = reward;

      formData.append('data', JSON.stringify(data));

      const result = await api.post<{ id: string }>('/reports', formData);
      navigate(`/reports/${result.id}`);
    } catch (err: any) {
      setError(err.message || '등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const isPerson = subjectType === 'PERSON';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">실종 신고 등록</h1>

      {/* 단계 표시 */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= step
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s}
            </div>
            {s < 3 && <div className="w-12 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: 유형 선택 */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              실종 유형을 선택하세요
            </label>
            <div className="grid grid-cols-3 gap-3">
              {SUBJECT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSubjectType(t.value)}
                  className={`p-4 rounded-xl border-2 text-center transition-colors ${
                    subjectType === t.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-1">{t.icon}</div>
                  <div className="text-sm font-medium">{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => subjectType && setStep(2)}
            disabled={!subjectType}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            다음
          </button>
        </div>
      )}

      {/* Step 2: 상세 정보 */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              사진 *
            </label>
            <PhotoUpload maxFiles={5} onChange={setPhotos} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={isPerson ? '홍길동' : '초코'}
                required
              />
            </div>

            {!isPerson && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  품종
                </label>
                <input
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="골든리트리버"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                성별
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">선택</option>
                <option value="MALE">수컷/남성</option>
                <option value="FEMALE">암컷/여성</option>
                <option value="UNKNOWN">모름</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                나이
              </label>
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={isPerson ? '30대 남성' : '3살'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                색상/털색
              </label>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={isPerson ? '' : '갈색'}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              특징 * (구별 가능한 특징을 상세히 적어주세요)
            </label>
            <textarea
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
              placeholder={
                isPerson
                  ? '키 170cm, 검은 안경, 파란 점퍼'
                  : '왼쪽 귀에 흰 반점, 빨간 목줄 착용'
              }
              required
            />
          </div>

          {isPerson && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                실종 당시 의상
              </label>
              <input
                value={clothingDesc}
                onChange={(e) => setClothingDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="검정 패딩, 청바지, 흰 운동화"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              이전
            </button>
            <button
              onClick={() => name && features ? setStep(3) : null}
              disabled={!name || !features}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 위치/연락처 */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              마지막 목격 일시 *
            </label>
            <input
              type="datetime-local"
              value={lastSeenAt}
              onChange={(e) => setLastSeenAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              마지막 목격 장소 *
            </label>
            <input
              value={lastSeenAddress}
              onChange={(e) => setLastSeenAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="서울시 강남구 역삼동 123"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                연락처 이름 *
              </label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                연락처 전화번호 *
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="01012345678"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              사례금 (선택)
            </label>
            <input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="소정의 사례금 드립니다"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              이전
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !lastSeenAt || !lastSeenAddress || !contactPhone || !contactName}
              className="flex-1 bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
            >
              {loading ? '등록 중...' : '실종 신고 등록'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
