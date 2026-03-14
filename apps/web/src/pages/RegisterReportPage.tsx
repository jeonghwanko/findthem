import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PhotoUpload from '../components/PhotoUpload';

export default function RegisterReportPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  const SUBJECT_TYPES = [
    { value: 'PERSON', label: t('subjectType.PERSON'), icon: '👤' },
    { value: 'DOG', label: t('subjectType.DOG'), icon: '🐕' },
    { value: 'CAT', label: t('subjectType.CAT'), icon: '🐈' },
  ];

  async function handleSubmit() {
    if (photos.length === 0) {
      setError(t('report.photoRequired'));
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
      void navigate(`/reports/${result.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('report.submitError'));
    } finally {
      setLoading(false);
    }
  }

  const isPerson = subjectType === 'PERSON';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('report.title')}</h1>

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
              {t('report.selectType')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {SUBJECT_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSubjectType(item.value)}
                  className={`p-4 rounded-xl border-2 text-center transition-colors ${
                    subjectType === item.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-1">{item.icon}</div>
                  <div className="text-sm font-medium">{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => subjectType && setStep(2)}
            disabled={!subjectType}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {t('report.next')}
          </button>
        </div>
      )}

      {/* Step 2: 상세 정보 */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('report.photo')}
            </label>
            <PhotoUpload maxFiles={5} onChange={setPhotos} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('report.nameLabel')}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={isPerson ? t('report.namePlaceholderPerson') : t('report.namePlaceholderAnimal')}
                required
              />
            </div>

            {!isPerson && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('report.species')}
                </label>
                <input
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder={t('report.speciesPlaceholder')}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('report.gender')}
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">{t('report.genderSelect')}</option>
                <option value="MALE">{t('report.genderMale')}</option>
                <option value="FEMALE">{t('report.genderFemale')}</option>
                <option value="UNKNOWN">{t('report.genderUnknown')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('report.age')}
              </label>
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={isPerson ? t('report.agePlaceholderPerson') : t('report.agePlaceholderAnimal')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('report.color')}
              </label>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={isPerson ? '' : t('report.colorPlaceholderAnimal')}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('report.features')}
            </label>
            <textarea
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
              placeholder={
                isPerson
                  ? t('report.featuresPlaceholderPerson')
                  : t('report.featuresPlaceholderAnimal')
              }
              required
            />
          </div>

          {isPerson && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('report.clothing')}
              </label>
              <input
                value={clothingDesc}
                onChange={(e) => setClothingDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder={t('report.clothingPlaceholder')}
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('report.prev')}
            </button>
            <button
              onClick={() => name && features ? setStep(3) : null}
              disabled={!name || !features}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {t('report.next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 위치/연락처 */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('report.lastSeenTime')}
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
              {t('report.lastSeenPlace')}
            </label>
            <input
              value={lastSeenAddress}
              onChange={(e) => setLastSeenAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder={t('report.lastSeenPlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('report.contactName')}
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
                {t('report.contactPhone')}
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
              {t('report.reward')}
            </label>
            <input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder={t('report.rewardPlaceholder')}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('report.prev')}
            </button>
            <button
              onClick={() => { void handleSubmit(); }}
              disabled={loading || !lastSeenAt || !lastSeenAddress || !contactPhone || !contactName}
              className="flex-1 bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
            >
              {loading ? t('report.submitting') : t('report.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
