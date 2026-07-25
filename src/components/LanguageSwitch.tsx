import { useI18n } from '../i18n/context';
import type { Locale } from '../i18n/locale';

const OPTIONS: { value: Locale; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'id', label: 'ID' }
];

export default function LanguageSwitch() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label="Language / Bahasa">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`lang-switch__btn ${locale === option.value ? 'active' : ''}`}
          onClick={() => setLocale(option.value)}
          aria-pressed={locale === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
