import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ko from './locales/ko/translation.json';

// 다국어 추가 시: LanguageDetector 복원 + resources에 해당 locale 추가
// import en from './locales/en/translation.json';
// import ja from './locales/ja/translation.json';
// import zhTW from './locales/zh-TW/translation.json';

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
    },
    lng: 'ko',
    fallbackLng: 'ko',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
