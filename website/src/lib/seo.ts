/**
 * Search and share tags for the single-page app. Every page goes through applySeo (via
 * useDocumentTitle), so title, description, canonical URL, robots, Open Graph / Twitter cards and
 * JSON-LD always match the screen. scripts/prerender.mjs writes the same tags into static HTML at
 * build time for crawlers and link previews that don't run JavaScript (WhatsApp, Facebook…).
 */
import type { Product } from '@/types/api';

export const SITE_NAME = 'Printing Galaxy';
/** Public address of the website, e.g. https://printinggalaxy.in (VITE_SITE_URL at build time). */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
export const DEFAULT_TITLE = 'Printing Galaxy — Printing, PVC cards, ID cards & gifts';
export const DEFAULT_DESCRIPTION =
  'Order notes printing, PVC Aadhaar and PAN cards, school ID cards, visiting cards, wedding invitations, photo frames and gifts online. Live prices, proof approval, pickup or home delivery.';
export const DEFAULT_IMAGE = '/og-image.png';

/** Account, checkout and other personal screens stay out of search results. */
const PRIVATE = [/^\/account/, /^\/checkout/, /^\/cart/, /^\/login/, /^\/institution(\/|$)/, /^\/institutions\/forgot-password/, /^\/p\//, /^\/track/, /^\/unsubscribe/];
export const isPrivatePath = (path: string) => PRIVATE.some((rx) => rx.test(path));

export type JsonLd = Record<string, unknown>;

export interface SeoOptions {
  description?: string;
  /** Absolute URL or a path on this site. */
  image?: string;
  type?: 'website' | 'product';
  noindex?: boolean;
  jsonLd?: JsonLd | JsonLd[];
}

const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`);

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function applySeo({ title, pathname, lang, ...o }: SeoOptions & { title?: string; pathname: string; lang: string }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const description = (o.description || DEFAULT_DESCRIPTION).replace(/\s+/g, ' ').trim().slice(0, 300);
  const path = pathname !== '/' ? pathname.replace(/\/$/, '') : '/';
  const url = `${SITE_URL}${path === '/' ? '/' : path}`;
  const image = absolute(o.image || DEFAULT_IMAGE);
  const hidden = o.noindex || isPrivatePath(path);

  document.title = fullTitle;
  document.documentElement.lang = lang;
  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', hidden ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  upsertLink('canonical', url);

  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:title', fullTitle);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:type', o.type === 'product' ? 'product' : 'website');
  upsertMeta('property', 'og:image', image);
  upsertMeta('property', 'og:locale', lang === 'hi' ? 'hi_IN' : 'en_IN');
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', fullTitle);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', image);

  const id = 'seo-jsonld';
  document.getElementById(id)?.remove();
  if (o.jsonLd && !hidden) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    script.text = JSON.stringify(o.jsonLd);
    document.head.appendChild(script);
  }
}

/** Breadcrumb trail for search results ("Products › Gifts & Frames › Photo Frame"). */
export function breadcrumbLd(items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}

/** Product with its price range (the price book's tiers), so search results can show "from ₹50". */
export function productLd(product: Product, name: string, description: string, prices: number[]): JsonLd {
  const url = `${SITE_URL}/products/${product.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    sku: product.slug,
    url,
    image: product.images.length ? product.images : [absolute(DEFAULT_IMAGE)],
    category: product.category?.name?.en,
    brand: { '@type': 'Brand', name: SITE_NAME },
    ...(product.rating && product.rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating.average, reviewCount: product.rating.count } }
      : {}),
    ...(prices.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'INR',
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: prices.length,
            availability: 'https://schema.org/InStock',
            url,
          },
        }
      : {}),
  };
}

/** The shop as a local business, plus the site search, for the home page. */
export function businessLd(shop?: { name?: string; phone?: string; email?: string; address?: string; hours?: string; mapUrl?: string }, social?: Record<string, string>): JsonLd[] {
  const sameAs = Object.values(social ?? {}).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${SITE_URL}/#business`,
      name: shop?.name || SITE_NAME,
      url: `${SITE_URL}/`,
      logo: absolute('/logo.png'),
      image: absolute(DEFAULT_IMAGE),
      ...(shop?.phone ? { telephone: `+91${shop.phone}` } : {}),
      ...(shop?.email ? { email: shop.email } : {}),
      ...(shop?.address ? { address: { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: 'IN' } } : {}),
      ...(shop?.mapUrl ? { hasMap: shop.mapUrl } : {}),
      priceRange: '₹',
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: ['en-IN', 'hi-IN'],
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}
