import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-TW', label: '繁中' },
];

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
}

export default function LanguageSwitcher({ variant = 'dark' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const className =
    variant === 'dark'
      ? 'bg-white/20 text-white text-xs px-2 py-1 rounded border border-white/30 outline-none cursor-pointer'
      : 'bg-white text-gray-700 text-xs px-2 py-1 rounded border border-gray-300 outline-none cursor-pointer hover:border-gray-400';

  return (
    <select
      value={i18n.language}
      onChange={(e) => { void i18n.changeLanguage(e.target.value); }}
      className={className}
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} className="text-gray-900">
          {lang.label}
        </option>
      ))}
    </select>
  );
}
