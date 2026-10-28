import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { applySeo, type SeoOptions } from '@/lib/seo';

/**
 * Page title plus everything search engines and link previews read: description, canonical URL,
 * robots, Open Graph / Twitter tags and JSON-LD. Personal pages are marked noindex automatically.
 */
export function useDocumentTitle(title?: string, options: SeoOptions = {}) {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const jsonLd = JSON.stringify(options.jsonLd ?? null);
  useEffect(() => {
    applySeo({ ...options, title, pathname, lang: i18n.language === 'hi' ? 'hi' : 'en' });
    // `options` is compared by value through its fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, pathname, i18n.language, options.description, options.image, options.type, options.noindex, jsonLd]);
}
