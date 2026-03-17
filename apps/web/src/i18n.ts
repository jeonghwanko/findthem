import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ko from './locales/ko/translation.json';
import en from './locales/en/translation.json';
import ja from './locales/ja/translation.json';
import zhTW from './locales/zh-TW/translation.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
      'zh-TW': { translation: zhTW },
    },
    fallbackLng: 'ko',
    // 'en-US', 'ko-KR' 등 full locale → 'en', 'ko' 등 리소스 키로 자동 매핑
    // 'zh-TW'는 목록에 명시되어 exact match로 처리됨
    supportedLngs: ['ko', 'en', 'ja', 'zh-TW'],
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'ft_locale',
    },
  });

export default i18n;
