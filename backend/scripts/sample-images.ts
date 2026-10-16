/**
 * Generates illustrated sample images for products and categories that have none, uploads them
 * to the public bucket and attaches them. Real photos added in the admin panel are never replaced
 * (pass --force to regenerate the samples anyway).
 *
 *   npm run sample-images -w backend
 */
import sharp from 'sharp';
import { connectDb, disconnectDb } from '@/config/db';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { ensureDevBuckets, publicUrl, putObject } from '@/modules/uploads/storage';

const W = 1200;
const H = 900;
const FONT = "font-family=\"'Segoe UI', 'Helvetica Neue', Arial, sans-serif\"";

const PALETTES = [
  { bg1: '#0f172a', bg2: '#1d4ed8', accent: '#38bdf8', ink: '#0f172a', paper: '#ffffff' },
  { bg1: '#f4f4f5', bg2: '#e0e7ff', accent: '#1d6cf0', ink: '#18181b', paper: '#ffffff' },
] as const;
type Palette = (typeof PALETTES)[number];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function frame(p: Palette, body: string, caption: string) {
  const dark = p.bg1.startsWith('#0');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="${dark ? 0.45 : 0.18}"/></filter>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${dark ? '#ffffff' : '#18181b'}" opacity="0.06"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <g transform="translate(0 0)">${body}</g>
  <rect x="0" y="${H - 8}" width="${W / 4}" height="8" fill="#12B5EA"/><rect x="${W / 4}" y="${H - 8}" width="${W / 4}" height="8" fill="#D9138A"/>
  <rect x="${W / 2}" y="${H - 8}" width="${W / 4}" height="8" fill="#FFC20E"/><rect x="${(3 * W) / 4}" y="${H - 8}" width="${W / 4}" height="8" fill="#131A2B"/>
  <text x="56" y="${H - 44}" ${FONT} font-size="30" font-weight="600" fill="${dark ? '#ffffff' : '#18181b'}" opacity="0.92">${esc(caption)}</text>
  <text x="${W - 56}" y="${H - 44}" ${FONT} font-size="22" text-anchor="end" fill="${dark ? '#ffffff' : '#18181b'}" opacity="0.55">Sample · Printing Galaxy</text>
</svg>`;
}

const lines = (x: number, y: number, n: number, w: number, color: string, gap = 26, h = 10) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${w * (i % 3 === 2 ? 0.6 : 1)}" height="${h}" rx="${h / 2}" fill="${color}"/>`).join('');

const person = (x: number, y: number, w: number, h: number, bg: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${bg}"/>
   <circle cx="${x + w / 2}" cy="${y + h * 0.4}" r="${w * 0.2}" fill="#f2c9a8"/>
   <path d="M${x + w * 0.15} ${y + h} q${w * 0.35} ${-h * 0.5} ${w * 0.7} 0 z" fill="#334155"/>`;

const MOCKUPS: Record<string, (p: Palette) => string> = {
  idCard: (p) => `<g filter="url(#sh)" transform="rotate(-6 600 400)">
      <rect x="290" y="210" width="620" height="390" rx="28" fill="${p.paper}"/>
      <rect x="290" y="210" width="620" height="92" rx="28" fill="${p.accent}"/><rect x="290" y="270" width="620" height="32" fill="${p.accent}"/>
      <text x="330" y="270" ${FONT} font-size="34" font-weight="700" fill="#fff">IDENTITY CARD</text>
      ${person(330, 330, 150, 190, '#e2e8f0')}
      ${lines(510, 345, 5, 340, '#cbd5e1', 34, 14)}
      <text x="510" y="565" ${FONT} font-size="40" font-weight="700" fill="${p.ink}">XXXX XXXX 1234</text>
    </g>`,
  schoolId: (p) => `<g filter="url(#sh)">
      <path d="M560 60 L600 210 L640 60" stroke="${p.accent}" stroke-width="22" fill="none"/>
      <rect x="440" y="190" width="320" height="500" rx="26" fill="${p.paper}"/>
      <rect x="440" y="190" width="320" height="130" rx="26" fill="${p.accent}"/><rect x="440" y="280" width="320" height="40" fill="${p.accent}"/>
      <circle cx="600" cy="245" r="34" fill="#fff"/><text x="600" y="300" ${FONT} font-size="22" font-weight="700" fill="#fff" text-anchor="middle">SUNRISE PUBLIC SCHOOL</text>
      ${person(530, 340, 140, 165, '#e2e8f0')}
      <text x="600" y="550" ${FONT} font-size="30" font-weight="700" fill="${p.ink}" text-anchor="middle">Aarav Sharma</text>
      ${lines(490, 575, 3, 220, '#cbd5e1', 28, 12)}
      <rect x="440" y="656" width="320" height="34" fill="${p.accent}"/>
    </g>`,
  document: (p) => `<g filter="url(#sh)">
      <rect x="430" y="150" width="420" height="560" rx="14" fill="${p.paper}" transform="rotate(8 640 430)"/>
      <rect x="400" y="140" width="420" height="560" rx="14" fill="${p.paper}" transform="rotate(3 610 420)"/>
      <rect x="370" y="130" width="420" height="560" rx="14" fill="${p.paper}"/>
      <rect x="410" y="175" width="230" height="22" rx="11" fill="${p.accent}"/>
      ${lines(410, 230, 14, 330, '#d4d4d8', 30, 11)}
    </g>`,
  spiral: (p) => `<g filter="url(#sh)">
      <rect x="380" y="140" width="460" height="580" rx="16" fill="${p.accent}"/>
      <rect x="400" y="160" width="430" height="550" rx="10" fill="${p.paper}"/>
      ${Array.from({ length: 13 }, (_, i) => `<rect x="${352}" y="${178 + i * 42}" width="62" height="16" rx="8" fill="#9ca3af"/>`).join('')}
      <rect x="470" y="230" width="290" height="70" rx="10" fill="${p.accent}" opacity="0.15"/>
      <text x="615" y="277" ${FONT} font-size="34" font-weight="700" fill="${p.ink}" text-anchor="middle">NOTES</text>
      ${lines(470, 340, 10, 290, '#d4d4d8', 32, 10)}
    </g>`,
  photos: (p) => `<g filter="url(#sh)">${Array.from({ length: 8 }, (_, i) => {
      const x = 330 + (i % 4) * 140;
      const y = 200 + Math.floor(i / 4) * 210;
      return `<rect x="${x - 8}" y="${y - 8}" width="126" height="176" rx="6" fill="${p.paper}"/>${person(x, y, 110, 160, i % 2 ? '#dbeafe' : '#e0f2fe')}`;
    }).join('')}</g>`,
  nameSlip: (p) => `<g filter="url(#sh)">${[0, 1, 2].map((i) => `
      <g transform="translate(${300 + i * 30} ${190 + i * 150}) rotate(${-4 + i * 4})">
        <rect width="560" height="230" rx="22" fill="${p.paper}" stroke="${p.accent}" stroke-width="8"/>
        ${person(26, 26, 140, 178, '#e0f2fe')}
        <text x="196" y="80" ${FONT} font-size="20" font-weight="700" fill="#71717a">NAME</text>
        <text x="196" y="122" ${FONT} font-size="40" font-weight="700" fill="${p.ink}">Aarav Sharma</text>
        ${lines(196, 150, 2, 300, '#d4d4d8', 28, 10)}
      </g>`).join('')}</g>`,
  keychain: (p) => `<g filter="url(#sh)">
      <circle cx="600" cy="170" r="58" fill="none" stroke="#a1a1aa" stroke-width="14"/>
      <rect x="590" y="215" width="20" height="60" fill="#a1a1aa"/>
      <rect x="440" y="260" width="320" height="420" rx="40" fill="${p.paper}" opacity="0.96"/>
      ${person(470, 290, 260, 280, '#bfdbfe')}
      <rect x="470" y="580" width="260" height="70" rx="12" fill="${p.accent}"/>
      <text x="600" y="628" ${FONT} font-size="38" font-weight="700" fill="#fff" text-anchor="middle">AARAV</text>
    </g>`,
  frame: (p) => `<g filter="url(#sh)">
      <rect x="360" y="120" width="480" height="600" rx="10" fill="#6b4226"/>
      <rect x="398" y="158" width="404" height="524" fill="${p.paper}"/>
      <rect x="420" y="180" width="360" height="480" fill="#bfdbfe"/>
      <circle cx="560" cy="360" r="70" fill="#f2c9a8"/><circle cx="660" cy="380" r="62" fill="#f5d0b5"/>
      <path d="M450 660 q110 -200 220 0 z" fill="#1e3a8a"/><path d="M570 660 q90 -170 180 0 z" fill="#be185d"/>
    </g>`,
  medal: (p) => `<g filter="url(#sh)">
      <path d="M520 100 L600 330 L680 100 Z" fill="${p.accent}"/><path d="M560 100 L600 230 L640 100 Z" fill="#fff" opacity="0.35"/>
      <circle cx="600" cy="480" r="190" fill="#f59e0b"/><circle cx="600" cy="480" r="150" fill="#fbbf24"/>
      <text x="600" y="470" ${FONT} font-size="44" font-weight="800" fill="#92400e" text-anchor="middle">1st</text>
      <text x="600" y="520" ${FONT} font-size="26" font-weight="700" fill="#92400e" text-anchor="middle">SPORTS DAY</text>
    </g>`,
  shield: (p) => `<g filter="url(#sh)">
      <rect x="430" y="610" width="340" height="80" rx="10" fill="#3f2a1c"/>
      <path d="M450 150 H750 V420 Q750 560 600 620 Q450 560 450 420 Z" fill="#a16207"/>
      <path d="M480 180 H720 V410 Q720 530 600 580 Q480 530 480 410 Z" fill="#fde68a"/>
      <text x="600" y="330" ${FONT} font-size="34" font-weight="800" fill="#78350f" text-anchor="middle">BEST</text>
      <text x="600" y="380" ${FONT} font-size="34" font-weight="800" fill="#78350f" text-anchor="middle">STUDENT</text>
      <text x="600" y="660" ${FONT} font-size="22" font-weight="600" fill="#fde68a" text-anchor="middle">2026-27</text>
    </g>`,
  tie: (p) => `<g filter="url(#sh)">
      <path d="M560 120 H640 L660 180 L600 220 L540 180 Z" fill="#1e3a8a"/>
      <path d="M540 200 L600 220 L660 200 L700 640 L600 740 L500 640 Z" fill="#1e3a8a"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${520} ${280 + i * 70} L${680} ${230 + i * 70}" stroke="${p.accent}" stroke-width="16"/>`).join('')}
      <circle cx="600" cy="560" r="34" fill="#fff"/><text x="600" y="570" ${FONT} font-size="22" font-weight="800" fill="#1e3a8a" text-anchor="middle">SPS</text>
    </g>`,
  belt: (p) => `<g filter="url(#sh)">
      <rect x="140" y="400" width="920" height="110" rx="20" fill="#1e3a8a"/>
      ${lines(220, 440, 1, 260, p.accent, 0, 30)}${lines(720, 440, 1, 260, p.accent, 0, 30)}
      <rect x="500" y="360" width="200" height="190" rx="24" fill="#d4d4d8" stroke="#a1a1aa" stroke-width="8"/>
      <text x="600" y="475" ${FONT} font-size="44" font-weight="800" fill="#1e3a8a" text-anchor="middle">SPS</text>
    </g>`,
  visitingCard: (p) => `<g filter="url(#sh)">
      <g transform="rotate(-8 520 420)"><rect x="250" y="250" width="520" height="300" rx="16" fill="${p.accent}"/>
        <text x="510" y="420" ${FONT} font-size="54" font-weight="800" fill="#fff" text-anchor="middle">KE</text></g>
      <g transform="rotate(5 700 470)"><rect x="440" y="320" width="520" height="300" rx="16" fill="${p.paper}"/>
        <rect x="440" y="320" width="18" height="300" fill="${p.accent}"/>
        <text x="490" y="420" ${FONT} font-size="40" font-weight="700" fill="${p.ink}">Ravi Kumar</text>
        <text x="490" y="458" ${FONT} font-size="24" fill="#71717a">Proprietor · Kumar Electronics</text>
        ${lines(490, 510, 3, 300, '#d4d4d8', 28, 10)}</g>
    </g>`,
  flyer: (p) => `<g filter="url(#sh)">
      <rect x="390" y="110" width="420" height="600" rx="10" fill="${p.paper}" transform="rotate(-5 600 410)"/>
      <rect x="390" y="110" width="420" height="600" rx="10" fill="${p.paper}"/>
      <rect x="390" y="110" width="420" height="240" rx="10" fill="${p.accent}"/>
      <text x="600" y="220" ${FONT} font-size="56" font-weight="800" fill="#fff" text-anchor="middle">GRAND</text>
      <text x="600" y="285" ${FONT} font-size="56" font-weight="800" fill="#fff" text-anchor="middle">OPENING</text>
      ${lines(430, 390, 8, 340, '#d4d4d8', 34, 12)}
    </g>`,
  invitation: (p) => `<g filter="url(#sh)">
      <rect x="330" y="160" width="540" height="540" rx="12" fill="#7f1d1d"/>
      <rect x="360" y="190" width="480" height="480" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="6"/>
      <circle cx="600" cy="300" r="56" fill="none" stroke="#b45309" stroke-width="6"/>
      <text x="600" y="420" ${FONT} font-size="44" font-weight="700" fill="#7f1d1d" text-anchor="middle">Wedding</text>
      <text x="600" y="470" ${FONT} font-size="30" fill="#92400e" text-anchor="middle">Invitation</text>
      ${lines(470, 520, 3, 260, '#d6b98c', 30, 10)}
    </g>`,
  stickers: (p) => `<g filter="url(#sh)">
      <circle cx="470" cy="370" r="160" fill="${p.accent}"/><text x="470" y="390" ${FONT} font-size="54" font-weight="800" fill="#fff" text-anchor="middle">LOGO</text>
      <rect x="610" y="260" width="300" height="300" rx="60" fill="#D9138A"/><text x="760" y="425" ${FONT} font-size="48" font-weight="800" fill="#fff" text-anchor="middle">SALE</text>
      <circle cx="560" cy="610" r="90" fill="#FFC20E"/><text x="560" y="625" ${FONT} font-size="34" font-weight="800" fill="#18181b" text-anchor="middle">NEW</text>
    </g>`,
  feeCard: (p) => `<g filter="url(#sh)">
      <rect x="260" y="200" width="680" height="480" rx="18" fill="${p.paper}"/>
      <rect x="260" y="200" width="680" height="80" rx="18" fill="${p.accent}"/><rect x="260" y="250" width="680" height="30" fill="${p.accent}"/>
      <text x="300" y="255" ${FONT} font-size="32" font-weight="700" fill="#fff">FEE RECORD · 2026-27</text>
      ${Array.from({ length: 9 }, (_, i) => `<line x1="300" y1="${330 + i * 36}" x2="900" y2="${330 + i * 36}" stroke="#e4e4e7" stroke-width="3"/>`).join('')}
      ${[420, 560, 720].map((x) => `<line x1="${x}" y1="300" x2="${x}" y2="618" stroke="#e4e4e7" stroke-width="3"/>`).join('')}
    </g>`,
};

function mockupFor(slug: string, category: string) {
  if (category === 'pvc-cards') return 'idCard';
  if (/student-id|teacher-id|out-pass/.test(slug)) return 'schoolId';
  if (/spiral|diary|homework/.test(slug)) return 'spiral';
  if (/passport/.test(slug)) return 'photos';
  if (/name-slip/.test(slug)) return 'nameSlip';
  if (/keychain/.test(slug)) return 'keychain';
  if (/frame/.test(slug)) return 'frame';
  if (/medal/.test(slug)) return 'medal';
  if (/shield|trophy/.test(slug)) return 'shield';
  if (/tie/.test(slug)) return 'tie';
  if (/belt/.test(slug)) return 'belt';
  if (/visiting/.test(slug)) return 'visitingCard';
  if (/bill|pamphlet|flyer/.test(slug)) return 'flyer';
  if (/wedding-card|invitation|save-the-date|greeting|shagun/.test(slug)) return 'invitation';
  if (/photo-print|calendar/.test(slug)) return 'photos';
  if (/poster|flex|standee|welcome-board/.test(slug)) return 'flyer';
  if (/sticker/.test(slug)) return 'stickers';
  if (/fee-card|report-card/.test(slug)) return 'feeCard';
  return 'document';
}

const CATEGORY_MOCKUP: Record<string, string> = {
  'pvc-cards': 'idCard',
  'student-printing': 'spiral',
  gifts: 'frame',
  'school-works': 'schoolId',
  'business-works': 'visitingCard',
  'wedding-invitations': 'invitation',
  'photo-printing': 'photos',
  'banners-signage': 'flyer',
  'office-stationery': 'document',
};

async function render(svg: string) {
  return sharp(Buffer.from(svg)).webp({ quality: 86 }).toBuffer();
}

async function upload(key: string, body: Buffer) {
  await putObject('public', key, body, 'image/webp');
  return `${publicUrl(key)}?v=${Date.now().toString(36)}`;
}

async function main() {
  const force = process.argv.includes('--force');
  await connectDb();
  await ensureDevBuckets();

  const categories = await CategoryModel.find();
  const slugById = new Map(categories.map((c) => [String(c._id), c.slug]));

  let products = 0;
  for (const product of await ProductModel.find()) {
    if (product.images.length && !force) continue;
    const kind = mockupFor(product.slug, slugById.get(String(product.category)) ?? '');
    const urls: string[] = [];
    for (const [i, palette] of PALETTES.entries()) {
      urls.push(await upload(`catalog/samples/${product.slug}-${i + 1}.webp`, await render(frame(palette, MOCKUPS[kind]!(palette), product.name.en))));
    }
    product.images = urls;
    await product.save();
    products += 1;
  }

  let cats = 0;
  for (const category of categories) {
    if (category.imageUrl && !force) continue;
    const kind = CATEGORY_MOCKUP[category.slug] ?? 'document';
    const palette = PALETTES[0];
    category.imageUrl = await upload(`catalog/samples/category-${category.slug}.webp`, await render(frame(palette, MOCKUPS[kind]!(palette), category.name.en)));
    await category.save();
    cats += 1;
  }

  console.log(`Sample images added: ${products} products, ${cats} categories`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
