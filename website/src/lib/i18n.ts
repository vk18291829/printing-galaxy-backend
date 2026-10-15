import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';
import { pickLocale } from './format';
import type { LocalizedString } from '@/types/api';

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिंदी', short: 'हि' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'pg-lang';

function initialLanguage(): Language {
  // A shared link like /pricing?lang=hi opens in that language.
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (fromUrl === 'en' || fromUrl === 'hi') return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'hi') return stored;
  } catch {
    // ignore
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
});
document.documentElement.lang = i18n.language;

export default i18n;

/** Returns a picker for `{ en, hi }` catalogue fields in the active language. */
export function useLocalized() {
  const { i18n: instance } = useTranslation();
  return (value: LocalizedString | undefined | null) => pickLocale(value, instance.language);
}
