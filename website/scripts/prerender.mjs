/**
 * Build-time SEO for the single-page app. After `vite build` this writes:
 *  - dist/<route>/index.html for every public page and product, with its own title, description,
 *    canonical URL, Open Graph / Twitter tags, JSON-LD and readable HTML inside #root, so search
 *    engines and link previews (WhatsApp, Facebook, X) see real content without running JavaScript.
 *    React replaces that HTML on load, so visitors see the normal app.
 *  - dist/sitemap.xml and dist/robots.txt.
 *
 * Env: SITE_URL / VITE_SITE_URL (public address, e.g. https://printinggalaxy.in) and
 * SEO_API_URL / VITE_API_URL (where to read products from). If the API can't be reached the
 * static pages are still written, just without products.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/** Same lookup order as Vite: process env first, then .env.production, then .env. */
function readEnv(key) {
  if (process.env[key]) return process.env[key];
  for (const file of ['.env.production.local', '.env.production', '.env.local', '.env']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const SITE_URL = (readEnv('SITE_URL') || readEnv('VITE_SITE_URL') || 'http://localhost:5173').replace(/\/$/, '');
// A relative VITE_API_URL (e.g. /api/v1) can't be fetched from Node, so fall back to the local API.
const apiEnv = readEnv('SEO_API_URL') || readEnv('VITE_API_URL');
const API_URL = (apiEnv && /^https?:\/\//.test(apiEnv) ? apiEnv : 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '');
const SITE_NAME = 'Printing Galaxy';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;
if (!readEnv('SITE_URL') && !readEnv('VITE_SITE_URL')) console.warn('[seo] VITE_SITE_URL is not set, using', SITE_URL);

const en = JSON.parse(readFileSync(join(root, 'src/locales/en.json'), 'utf8'));
const sections = readFileSync(join(root, 'src/features/catalog/sections.ts'), 'utf8');
const listOf = (name) => JSON.parse((sections.match(new RegExp(`${name} = (\\[[^\\]]*\\])`))?.[1] ?? '[]').replace(/'/g, '"'));
const BUSINESS = listOf('BUSINESS_CATEGORIES');
const WEDDING = listOf('WEDDING_CATEGORIES');
const SCHOOL = listOf('SCHOOL_CATEGORIES');

const PRIVATE = ['/account', '/checkout', '/cart', '/login', '/institution$', '/institution/', '/institutions/forgot-password', '/p/', '/track', '/unsubscribe'];

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s = '', n = 160) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};
const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

async function get(path) {
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body?.data ?? body;
  } catch (err) {
    console.warn(`[seo] could not load ${API_URL}${path}: ${err.message}`);
    return undefined;
  }
}

const [retail = [], institution = [], settings] = await Promise.all([
  get('/products?section=retail'),
  get('/products?section=institution'),
  get('/settings/public'),
]);
const shop = settings?.shop ?? {};

/** One entry per product slug; retail price book wins when a product is in both. */
const products = new Map();
for (const p of [...institution, ...retail]) products.set(p.slug, p);

const homeOf = (slug) =>
  SCHOOL.includes(slug) ? '/institutions' : BUSINESS.includes(slug) ? '/business-printing' : WEDDING.includes(slug) ? '/wedding-cards' : '/products';
const priceBook = (p) => (p.pricing?.retail?.enabled ? p.pricing.retail : p.pricing?.institution);
const prices = (p) => (priceBook(p)?.enabled ? priceBook(p).tiers.map((t) => t.unitPrice) : []);
const productList = (list) =>
  list.length
    ? `<ul>${list
        .map((p) => {
          const from = prices(p).length ? ` — from ${money(Math.min(...prices(p)))} per ${esc(p.unit || 'piece')}` : '';
          return `<li><a href="/products/${esc(p.slug)}">${esc(p.name.en)}</a>${from}. ${esc(p.shortDescription?.en ?? '')}</li>`;
        })
        .join('')}</ul>`
    : '';
const all = [...products.values()];
const inSection = (cats) => all.filter((p) => cats.includes(p.category?.slug));
const individual = retail.filter((p) => ![...BUSINESS, ...WEDDING, ...SCHOOL].includes(p.category?.slug));

const nav = `<nav><a href="/">Home</a> · <a href="/products">Everyday printing</a> · <a href="/institutions">School &amp; College</a> · <a href="/business-printing">Business Works</a> · <a href="/wedding-cards">Wedding &amp; Invitations</a> · <a href="/contact">Contact</a></nav>`;
const footer = `<footer><p>${esc(shop.name || SITE_NAME)}${shop.address ? ` · ${esc(shop.address)}` : ''}${shop.phone ? ` · +91 ${esc(shop.phone)}` : ''}${shop.hours ? ` · ${esc(shop.hours)}` : ''}</p><p><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refund-policy">Refunds</a> · <a href="/shipping-policy">Shipping</a></p></footer>`;
const body = (h1, intro, extra = '') => `${nav}<main><h1>${esc(h1)}</h1><p>${esc(intro)}</p>${extra}</main>${footer}`;

const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
});
const sameAs = Object.values(settings?.social ?? {}).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
const businessLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#business`,
    name: shop.name || SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.png`,
    image: DEFAULT_IMAGE,
    ...(shop.phone ? { telephone: `+91${shop.phone}` } : {}),
    ...(shop.email ? { email: shop.email } : {}),
    ...(shop.address ? { address: { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: 'IN' } } : {}),
    ...(shop.mapUrl ? { hasMap: shop.mapUrl } : {}),
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

const seo = en.seo;
const pages = [
  { path: '/', title: null, description: seo.homeDesc, priority: '1.0', jsonLd: businessLd,
    html: body('Printing Galaxy — printing, PVC cards, ID cards & gifts', seo.homeDesc, productList(retail.filter((p) => p.isFeatured).slice(0, 12))) },
  { path: '/products', title: seo.productsTitle, description: seo.productsDesc, priority: '0.9', html: body(seo.productsTitle, seo.productsDesc, productList(individual)),
    jsonLd: crumbs([{ name: 'Home', path: '/' }, { name: 'Everyday printing', path: '/products' }]) },
  { path: '/institutions', title: seo.institutionsTitle, description: seo.institutionsDesc, priority: '0.9', html: body(seo.institutionsTitle, seo.institutionsDesc, productList(inSection(SCHOOL))) },
  { path: '/business-printing', title: seo.businessTitle, description: seo.businessDesc, priority: '0.9', html: body(seo.businessTitle, seo.businessDesc, productList(inSection(BUSINESS))) },
  { path: '/wedding-cards', title: seo.weddingTitle, description: seo.weddingDesc, priority: '0.9', html: body(seo.weddingTitle, seo.weddingDesc, productList(inSection(WEDDING))) },
  { path: '/contact', title: seo.contactTitle, description: seo.contactDesc, priority: '0.6', html: body(seo.contactTitle, seo.contactDesc) },
  { path: '/institutions/register', title: en.auth?.registerTitle ?? 'Register your institution', description: seo.registerDesc, priority: '0.5', html: body(en.auth?.registerTitle ?? 'Register', seo.registerDesc) },
  ...[['/terms', 'terms'], ['/privacy', 'privacy'], ['/refund-policy', 'refund'], ['/shipping-policy', 'shipping']].map(([path, kind]) => ({
    path, title: en.legal[kind].title, description: seo.legalDesc, priority: '0.3', html: body(en.legal[kind].title, seo.legalDesc),
  })),
];

for (const p of products.values()) {
  const name = p.name.en;
  const description = clip(`${p.shortDescription?.en ?? ''} ${p.description?.en ?? ''}`.trim() || `${name} printing from ${SITE_NAME}.`);
  const home = homeOf(p.category?.slug);
  const homeName = { '/products': 'Everyday printing', '/institutions': 'School & College', '/business-printing': 'Business Works', '/wedding-cards': 'Wedding & Invitations' }[home];
  const tiers = priceBook(p)?.enabled ? priceBook(p).tiers : [];
  const url = `${SITE_URL}/products/${p.slug}`;
  const ps = prices(p);
  const priceHtml = tiers.length
    ? `<h2>Price</h2><ul>${tiers.map((t) => `<li>${t.minQty}+ ${esc(p.unit || 'piece')}: ${money(t.unitPrice)} each</li>`).join('')}</ul>`
    : '';
  const specs = (p.specs ?? []).length ? `<h2>Details</h2><ul>${p.specs.map((s) => `<li>${esc(typeof s === 'string' ? s : s?.en ?? '')}</li>`).join('')}</ul>` : '';
  pages.push({
    path: `/products/${p.slug}`,
    title: name,
    description,
    image: p.images?.[0],
    type: 'product',
    lastmod: p.updatedAt,
    images: p.images ?? [],
    priority: '0.8',
    html: body(name, description, `${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="${esc(name)}" width="600">` : ''}${priceHtml}${specs}<p><a href="${home}">More ${esc(homeName)}</a></p>`),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        description,
        sku: p.slug,
        url,
        image: p.images?.length ? p.images : [DEFAULT_IMAGE],
        category: p.category?.name?.en,
        brand: { '@type': 'Brand', name: SITE_NAME },
        ...(p.rating?.count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count } } : {}),
        ...(ps.length
          ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: Math.min(...ps), highPrice: Math.max(...ps), offerCount: ps.length, availability: 'https://schema.org/InStock', url } }
          : {}),
      },
      crumbs([{ name: 'Home', path: '/' }, { name: homeName, path: home }, { name, path: `/products/${p.slug}` }]),
    ],
  });
}

// ---- write the pages ----------------------------------------------------------------------------
const template = readFileSync(join(dist, 'index.html'), 'utf8');
/** Tags applySeo manages; removed from the template so each page carries only its own. */
const MANAGED = /\s*<(meta\s+(name|property)="(description|robots|og:[^"]+|twitter:[^"]+)"[^>]*|link rel="canonical"[^>]*)>/g;

function render(page) {
  const fullTitle = page.title ? `${page.title} | ${SITE_NAME}` : `${SITE_NAME} — Printing, PVC cards, ID cards & gifts`;
  const description = clip(page.description, 300);
  const url = `${SITE_URL}${page.path}`;
  const image = page.image || DEFAULT_IMAGE;
  const head = [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:type" content="${page.type === 'product' ? 'product' : 'website'}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    page.jsonLd ? `<script type="application/ld+json" id="seo-jsonld">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  return template
    .replace(MANAGED, '')
    .replace(/<title>[\s\S]*?<\/title>/, () => head)
    .replace(
      '<div id="root"></div>',
      // The server falls back to the home page's file for app-only routes (/account, /checkout…);
      // the guard clears its text there so it never flashes before the app loads.
      () => `<div id="root">${page.html}</div>
    <script>if (location.pathname.replace(/\\/$/, '') !== ${JSON.stringify(page.path === '/' ? '' : page.path)}) document.getElementById('root').innerHTML = '';</script>`,
    );
}

for (const page of pages) {
  const file = page.path === '/' ? join(dist, 'index.html') : join(dist, page.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, render(page));
}

// ---- sitemap + robots ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${pages
  .map(
    (p) => `  <url>
    <loc>${esc(`${SITE_URL}${p.path}`)}</loc>
    <lastmod>${(p.lastmod ?? today).slice(0, 10)}</lastmod>
    <priority>${p.priority}</priority>${(p.images ?? [])
      .slice(0, 5)
      .map((src) => `\n    <image:image><image:loc>${esc(src)}</image:loc></image:image>`)
      .join('')}
  </url>`,
  )
  .join('\n')}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);

const robots = `User-agent: *
Allow: /
${PRIVATE.map((p) => `Disallow: ${p}`).join('\n')}

Sitemap: ${SITE_URL}/sitemap.xml
`;
writeFileSync(join(dist, 'robots.txt'), robots);

console.log(`[seo] ${pages.length} pages (${products.size} products), sitemap.xml and robots.txt for ${SITE_URL}`);
