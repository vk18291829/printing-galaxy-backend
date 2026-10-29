/**
 * Generates illustrated sample images for products and categories, uploads them to the public
 * bucket and attaches them. Every product gets its own picture, drawn in the logo's colours only
 * (navy, amber, cyan, magenta). Products with a real photo added in the admin panel are never
 * touched; samples made earlier are redrawn. Pass --force to redraw everything, real photos too.
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

/** The logo's colours, with tints mixed from them for paper and photo areas. */
const NAVY = '#0B2A65';
const NAVY_DEEP = '#071C45';
const AMBER = '#FC9A01';
const CYAN = '#00ACFA';
const MAGENTA = '#F91570';
const INK = '#0B1B3F';
const MUTED = '#5A6A88';
const LINE = '#DFE5EF';
const TINT = '#EAF0F9';
const CYAN_TINT = '#D9F2FE';
const AMBER_TINT = '#FFF1D9';
const SKIN = '#F2C9A8';

const PALETTES = [
  { bg1: NAVY_DEEP, bg2: NAVY, accent: CYAN, ink: INK, paper: '#ffffff' },
  { bg1: '#F5F7FB', bg2: TINT, accent: NAVY, ink: INK, paper: '#ffffff' },
] as const;
type Palette = (typeof PALETTES)[number];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function frame(p: Palette, body: string, caption: string) {
  const dark = p.bg1 === NAVY_DEEP;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="${dark ? 0.4 : 0.14}"/></filter>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${dark ? '#ffffff' : NAVY}" opacity="0.06"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <g>${body}</g>
  <rect x="0" y="${H - 8}" width="${W / 4}" height="8" fill="${CYAN}"/><rect x="${W / 4}" y="${H - 8}" width="${W / 4}" height="8" fill="${MAGENTA}"/>
  <rect x="${W / 2}" y="${H - 8}" width="${W / 4}" height="8" fill="${AMBER}"/><rect x="${(3 * W) / 4}" y="${H - 8}" width="${W / 4}" height="8" fill="${dark ? '#ffffff' : NAVY}"/>
  <text x="56" y="${H - 44}" ${FONT} font-size="30" font-weight="600" fill="${dark ? '#ffffff' : INK}" opacity="0.92">${esc(caption)}</text>
  <text x="${W - 56}" y="${H - 44}" ${FONT} font-size="22" text-anchor="end" fill="${dark ? '#ffffff' : INK}" opacity="0.55">Sample · Printing Galaxy</text>
</svg>`;
}

const lines = (x: number, y: number, n: number, w: number, color: string, gap = 26, h = 10) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${w * (i % 3 === 2 ? 0.6 : 1)}" height="${h}" rx="${h / 2}" fill="${color}"/>`).join('');

const person = (x: number, y: number, w: number, h: number, bg: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${bg}"/>
   <circle cx="${x + w / 2}" cy="${y + h * 0.4}" r="${w * 0.2}" fill="${SKIN}"/>
   <path d="M${x + w * 0.15} ${y + h} q${w * 0.35} ${-h * 0.5} ${w * 0.7} 0 z" fill="${NAVY}"/>`;

/** A small landscape "photo": sky, sun and hills. */
const scene = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CYAN_TINT}"/>
   <circle cx="${x + w * 0.72}" cy="${y + h * 0.3}" r="${Math.min(w, h) * 0.11}" fill="${AMBER}"/>
   <path d="M${x} ${y + h} L${x + w * 0.35} ${y + h * 0.45} L${x + w * 0.6} ${y + h * 0.75} L${x + w * 0.78} ${y + h * 0.55} L${x + w} ${y + h} Z" fill="${NAVY}"/>`;

const text = (x: number, y: number, size: number, fill: string, value: string, weight = 700, anchor = 'middle') =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;

/** The shop logo stand-in on stationery: a rounded square with initials. */
const mark = (x: number, y: number, s: number, fill = NAVY) =>
  `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${fill}"/>${text(x + s / 2, y + s * 0.63, s * 0.38, '#fff', 'KE', 800)}`;

type Mockup = (p: Palette, label?: string) => string;

const MOCKUPS: Record<string, Mockup> = {
  /** Generic PVC copy of an identity document: never a replica of a real government design. */
  idCard: (p, label = 'ID CARD') => `<g filter="url(#sh)" transform="rotate(-6 600 400)">
      <rect x="290" y="210" width="620" height="390" rx="28" fill="${p.paper}"/>
      <rect x="290" y="210" width="620" height="92" rx="28" fill="${NAVY}"/><rect x="290" y="270" width="620" height="32" fill="${NAVY}"/>
      ${text(330, 270, 32, '#fff', 'PVC COPY', 700, 'start')}
      <rect x="690" y="236" width="190" height="44" rx="22" fill="${AMBER}"/>${text(785, 267, 22, NAVY, label, 800)}
      ${person(330, 330, 150, 190, TINT)}
      ${lines(510, 345, 5, 340, LINE, 34, 14)}
      ${text(510, 565, 40, INK, 'XXXX XXXX 1234', 700, 'start')}
    </g>`,
  schoolId: (p, label = 'STUDENT') => `<g filter="url(#sh)">
      <path d="M560 60 L600 210 L640 60" stroke="${CYAN}" stroke-width="22" fill="none"/>
      <rect x="440" y="190" width="320" height="500" rx="26" fill="${p.paper}"/>
      <rect x="440" y="190" width="320" height="130" rx="26" fill="${NAVY}"/><rect x="440" y="280" width="320" height="40" fill="${NAVY}"/>
      <circle cx="600" cy="245" r="34" fill="#fff"/>${text(600, 300, 22, '#fff', 'SUNRISE PUBLIC SCHOOL')}
      ${person(530, 340, 140, 165, TINT)}
      ${text(600, 550, 30, INK, label === 'TEACHER' ? 'Meena Verma' : 'Aarav Sharma')}
      ${lines(490, 575, 3, 220, LINE, 28, 12)}
      <rect x="440" y="650" width="320" height="40" fill="${label === 'OUT PASS' ? MAGENTA : AMBER}"/>${text(600, 679, 22, label === 'OUT PASS' ? '#fff' : NAVY, label, 800)}
    </g>`,
  document: (p) => `<g filter="url(#sh)">
      <rect x="430" y="150" width="420" height="560" rx="14" fill="${p.paper}" transform="rotate(8 640 430)"/>
      <rect x="400" y="140" width="420" height="560" rx="14" fill="${p.paper}" transform="rotate(3 610 420)"/>
      <rect x="370" y="130" width="420" height="560" rx="14" fill="${p.paper}"/>
      <rect x="410" y="175" width="230" height="22" rx="11" fill="${INK}"/>
      ${lines(410, 230, 14, 330, '#C9CFD9', 30, 11)}
      <rect x="640" y="640" width="120" height="34" rx="17" fill="${TINT}"/>${text(700, 664, 18, MUTED, '120 pages', 600)}
    </g>`,
  colourNotes: (p) => `<g filter="url(#sh)">
      <rect x="400" y="140" width="420" height="560" rx="14" fill="${p.paper}" transform="rotate(4 610 420)"/>
      <rect x="370" y="130" width="420" height="560" rx="14" fill="${p.paper}"/>
      <rect x="410" y="175" width="230" height="22" rx="11" fill="${NAVY}"/>
      ${lines(410, 225, 4, 330, LINE, 28, 11)}
      ${[CYAN, MAGENTA, AMBER, NAVY].map((c, i) => `<rect x="${430 + i * 75}" y="${520 - [90, 150, 120, 180][i]!}" width="52" height="${[90, 150, 120, 180][i]}" rx="6" fill="${c}"/>`).join('')}
      <line x1="415" y1="522" x2="745" y2="522" stroke="${LINE}" stroke-width="4"/>
      ${lines(410, 560, 4, 330, LINE, 28, 11)}
    </g>`,
  slides: (p) => `<g filter="url(#sh)">
      <rect x="370" y="110" width="460" height="620" rx="14" fill="${p.paper}"/>
      ${Array.from({ length: 6 }, (_, i) => {
        const x = 400 + (i % 2) * 210;
        const y = 140 + Math.floor(i / 2) * 195;
        return `<rect x="${x}" y="${y}" width="190" height="170" rx="8" fill="${TINT}" stroke="${LINE}" stroke-width="3"/>
          <rect x="${x + 16}" y="${y + 18}" width="110" height="14" rx="7" fill="${NAVY}"/>
          ${lines(x + 16, y + 48, 3, 120, '#C9CFD9', 22, 9)}
          <rect x="${x + 130}" y="${y + 110}" width="44" height="44" rx="8" fill="${[CYAN, MAGENTA, AMBER][i % 3]}"/>`;
      }).join('')}
    </g>`,
  spiral: (p) => `<g filter="url(#sh)">
      <rect x="380" y="140" width="460" height="580" rx="16" fill="${NAVY}"/>
      <rect x="400" y="160" width="430" height="550" rx="10" fill="${p.paper}"/>
      ${Array.from({ length: 13 }, (_, i) => `<rect x="352" y="${178 + i * 42}" width="62" height="16" rx="8" fill="#A9B3C4"/>`).join('')}
      <rect x="470" y="230" width="290" height="70" rx="10" fill="${AMBER_TINT}"/>
      ${text(615, 277, 34, INK, 'NOTES')}
      ${lines(470, 340, 10, 290, LINE, 32, 10)}
    </g>`,
  projectFile: (p) => `<g filter="url(#sh)">
      <rect x="400" y="130" width="440" height="590" rx="14" fill="${p.paper}" transform="rotate(3 620 425)"/>
      <rect x="380" y="120" width="440" height="590" rx="14" fill="${NAVY}"/>
      ${Array.from({ length: 12 }, (_, i) => `<circle cx="410" cy="${160 + i * 46}" r="9" fill="#ffffff" opacity="0.8"/>`).join('')}
      <rect x="450" y="210" width="320" height="200" rx="12" fill="#ffffff"/>
      ${text(610, 290, 40, NAVY, 'PROJECT', 800)}${text(610, 340, 30, MUTED, 'FILE · 2026-27', 600)}
      <rect x="450" y="470" width="320" height="56" rx="28" fill="${AMBER}"/>${text(610, 507, 24, NAVY, 'VIVA READY', 800)}
      ${lines(470, 570, 3, 280, '#ffffff', 30, 10)}
    </g>`,
  photos: (p) => `<g filter="url(#sh)">${Array.from({ length: 8 }, (_, i) => {
      const x = 330 + (i % 4) * 140;
      const y = 200 + Math.floor(i / 4) * 210;
      return `<rect x="${x - 8}" y="${y - 8}" width="126" height="176" rx="6" fill="${p.paper}"/>${person(x, y, 110, 160, i % 2 ? TINT : CYAN_TINT)}`;
    }).join('')}</g>`,
  prints4x6: (p) => `<g filter="url(#sh)">
      ${[-10, 2, 12].map((r, i) => `<g transform="rotate(${r} 600 430)"><rect x="${330 + i * 40}" y="${220 + i * 30}" width="480" height="340" rx="8" fill="${p.paper}"/>${scene(350 + i * 40, 240 + i * 30, 440, 300)}</g>`).join('')}
    </g>`,
  photoA4: (p) => `<g filter="url(#sh)">
      <rect x="390" y="110" width="420" height="600" rx="8" fill="${p.paper}"/>
      ${scene(415, 135, 370, 470)}
      ${lines(430, 640, 2, 300, LINE, 26, 10)}
    </g>`,
  posterA3: (p) => `<g filter="url(#sh)">
      <rect x="400" y="80" width="400" height="640" rx="6" fill="${MAGENTA}"/>
      <circle cx="600" cy="290" r="130" fill="${AMBER}"/>
      <path d="M400 470 L540 330 L640 430 L720 360 L800 440 L800 720 L400 720 Z" fill="${NAVY}"/>
      ${text(600, 560, 56, '#fff', 'SUMMER', 800)}${text(600, 620, 56, '#fff', 'FEST', 800)}
      ${text(600, 680, 22, '#fff', '12 – 14 MAY', 600)}
    </g>`,
  calendar: (p) => `<g filter="url(#sh)">
      <rect x="590" y="70" width="20" height="60" rx="10" fill="#A9B3C4"/>
      <rect x="380" y="110" width="440" height="610" rx="14" fill="${p.paper}"/>
      ${scene(400, 130, 400, 250)}
      ${text(600, 430, 34, INK, 'JANUARY 2027', 800)}
      ${Array.from({ length: 35 }, (_, i) => `<rect x="${410 + (i % 7) * 55}" y="${460 + Math.floor(i / 7) * 48}" width="44" height="36" rx="6" fill="${i === 25 ? AMBER : TINT}"/>`).join('')}
    </g>`,
  nameSlip: (p) => `<g filter="url(#sh)">${[0, 1, 2].map((i) => `
      <g transform="translate(${300 + i * 30} ${190 + i * 150}) rotate(${-4 + i * 4})">
        <rect width="560" height="230" rx="22" fill="${p.paper}" stroke="${CYAN}" stroke-width="8"/>
        ${person(26, 26, 140, 178, CYAN_TINT)}
        ${text(196, 80, 20, MUTED, 'NAME', 700, 'start')}
        ${text(196, 122, 40, INK, 'Aarav Sharma', 700, 'start')}
        ${lines(196, 150, 2, 300, LINE, 28, 10)}
      </g>`).join('')}</g>`,
  keychain: (p) => `<g filter="url(#sh)">
      <circle cx="600" cy="170" r="58" fill="none" stroke="#A9B3C4" stroke-width="14"/>
      <rect x="590" y="215" width="20" height="60" fill="#A9B3C4"/>
      <rect x="440" y="260" width="320" height="420" rx="40" fill="${p.paper}" opacity="0.96"/>
      ${person(470, 290, 260, 280, CYAN_TINT)}
      <rect x="470" y="580" width="260" height="70" rx="12" fill="${CYAN}"/>
      ${text(600, 628, 38, '#fff', 'AARAV')}
    </g>`,
  logoKeychain: () => `<g filter="url(#sh)">
      <circle cx="600" cy="170" r="58" fill="none" stroke="#A9B3C4" stroke-width="14"/>
      <rect x="590" y="215" width="20" height="60" fill="#A9B3C4"/>
      <circle cx="600" cy="460" r="200" fill="${AMBER}"/>
      <circle cx="600" cy="460" r="160" fill="#ffffff"/>
      ${mark(530, 380, 140)}
      ${text(600, 600, 26, NAVY, 'KUMAR ELECTRONICS', 800)}
    </g>`,
  frame: (p) => `<g filter="url(#sh)">
      <rect x="360" y="120" width="480" height="600" rx="10" fill="#6B4226"/>
      <rect x="398" y="158" width="404" height="524" fill="${p.paper}"/>
      <rect x="420" y="180" width="360" height="480" fill="${CYAN_TINT}"/>
      <circle cx="560" cy="360" r="70" fill="${SKIN}"/><circle cx="660" cy="380" r="62" fill="#F5D0B5"/>
      <path d="M450 660 q110 -200 220 0 z" fill="${NAVY}"/><path d="M570 660 q90 -170 180 0 z" fill="${MAGENTA}"/>
    </g>`,
  medal: () => `<g filter="url(#sh)">
      <path d="M520 100 L600 330 L680 100 Z" fill="${CYAN}"/><path d="M560 100 L600 230 L640 100 Z" fill="#fff" opacity="0.35"/>
      <circle cx="600" cy="480" r="190" fill="#E08900"/><circle cx="600" cy="480" r="150" fill="${AMBER}"/>
      ${text(600, 470, 44, NAVY, '1st', 800)}${text(600, 520, 26, NAVY, 'SPORTS DAY')}
    </g>`,
  shield: () => `<g filter="url(#sh)">
      <rect x="430" y="610" width="340" height="80" rx="10" fill="${NAVY_DEEP}"/>
      <path d="M450 150 H750 V420 Q750 560 600 620 Q450 560 450 420 Z" fill="#E08900"/>
      <path d="M480 180 H720 V410 Q720 530 600 580 Q480 530 480 410 Z" fill="${AMBER_TINT}"/>
      ${text(600, 330, 34, NAVY, 'BEST', 800)}${text(600, 380, 34, NAVY, 'STUDENT', 800)}
      ${text(600, 660, 22, AMBER, '2026-27', 600)}
    </g>`,
  tie: () => `<g filter="url(#sh)">
      <path d="M560 120 H640 L660 180 L600 220 L540 180 Z" fill="${NAVY}"/>
      <path d="M540 200 L600 220 L660 200 L700 640 L600 740 L500 640 Z" fill="${NAVY}"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M520 ${280 + i * 70} L680 ${230 + i * 70}" stroke="${AMBER}" stroke-width="16"/>`).join('')}
      <circle cx="600" cy="560" r="34" fill="#fff"/>${text(600, 570, 22, NAVY, 'SPS', 800)}
    </g>`,
  belt: () => `<g filter="url(#sh)">
      <rect x="140" y="400" width="920" height="110" rx="20" fill="${NAVY}"/>
      ${lines(220, 440, 1, 260, CYAN, 0, 30)}${lines(720, 440, 1, 260, CYAN, 0, 30)}
      <rect x="500" y="360" width="200" height="190" rx="24" fill="#D4DAE4" stroke="#A9B3C4" stroke-width="8"/>
      ${text(600, 475, 44, NAVY, 'SPS', 800)}
    </g>`,
  visitingCard: (p) => `<g filter="url(#sh)">
      <g transform="rotate(-8 520 420)"><rect x="250" y="250" width="520" height="300" rx="16" fill="${CYAN}"/>
        ${mark(330, 300, 110)}</g>
      <g transform="rotate(5 700 470)"><rect x="440" y="320" width="520" height="300" rx="16" fill="${p.paper}"/>
        <rect x="440" y="320" width="18" height="300" fill="${AMBER}"/>
        ${text(490, 420, 40, INK, 'Ravi Kumar', 700, 'start')}
        ${text(490, 458, 24, MUTED, 'Proprietor · Kumar Electronics', 400, 'start')}
        ${lines(490, 510, 3, 300, LINE, 28, 10)}</g>
    </g>`,
  flyer: (p) => `<g filter="url(#sh)">
      <rect x="390" y="110" width="420" height="600" rx="10" fill="${p.paper}" transform="rotate(-5 600 410)"/>
      <rect x="390" y="110" width="420" height="600" rx="10" fill="${p.paper}"/>
      <rect x="390" y="110" width="420" height="240" rx="10" fill="${MAGENTA}"/>
      ${text(600, 220, 56, '#fff', 'GRAND', 800)}${text(600, 285, 56, '#fff', 'OPENING', 800)}
      ${lines(430, 390, 6, 340, LINE, 34, 12)}
      <rect x="430" y="610" width="200" height="54" rx="27" fill="${AMBER}"/>${text(530, 646, 24, NAVY, '20% OFF', 800)}
    </g>`,
  banner: () => `<g filter="url(#sh)">
      <rect x="120" y="250" width="960" height="380" rx="8" fill="${AMBER}"/>
      <rect x="150" y="280" width="900" height="320" rx="4" fill="${NAVY}"/>
      ${[150, 1050].flatMap((x) => [280, 600].map((y) => `<circle cx="${x}" cy="${y}" r="14" fill="#D4DAE4" stroke="#A9B3C4" stroke-width="5"/>`)).join('')}
      ${text(600, 420, 92, '#fff', 'MEGA SALE', 800)}
      ${text(600, 490, 34, AMBER, 'UP TO 50% OFF · THIS WEEK ONLY', 700)}
      ${lines(430, 535, 1, 340, CYAN, 0, 14)}
    </g>`,
  standee: (p) => `<g filter="url(#sh)">
      <rect x="440" y="80" width="320" height="600" rx="6" fill="${p.paper}"/>
      <rect x="440" y="80" width="320" height="230" rx="6" fill="${NAVY}"/>
      ${mark(545, 120, 110, AMBER)}
      ${text(600, 280, 28, '#fff', 'WELCOME', 800)}
      ${lines(475, 350, 6, 250, LINE, 34, 12)}
      <rect x="475" y="580" width="250" height="60" rx="30" fill="${CYAN}"/>${text(600, 620, 24, '#fff', 'VISIT US', 800)}
      <rect x="420" y="680" width="360" height="34" rx="10" fill="#A9B3C4"/>
      <rect x="440" y="714" width="40" height="24" rx="6" fill="#8792A6"/><rect x="720" y="714" width="40" height="24" rx="6" fill="#8792A6"/>
    </g>`,
  letterhead: (p) => `<g filter="url(#sh)">
      <rect x="400" y="140" width="420" height="580" rx="10" fill="${p.paper}" transform="rotate(4 610 430)"/>
      <rect x="380" y="120" width="420" height="580" rx="10" fill="${p.paper}"/>
      ${mark(410, 150, 70)}
      ${text(500, 185, 26, INK, 'Kumar Electronics', 800, 'start')}${text(500, 212, 16, MUTED, 'Main Market · +91 98765 43210', 400, 'start')}
      <rect x="410" y="240" width="360" height="5" fill="${AMBER}"/>
      ${lines(410, 290, 10, 340, LINE, 30, 10)}
      <rect x="380" y="660" width="420" height="40" fill="${NAVY}"/>
    </g>`,
  billBook: (p) => `<g filter="url(#sh)">
      <rect x="400" y="150" width="440" height="560" rx="10" fill="${CYAN_TINT}" transform="rotate(5 620 430)"/>
      <rect x="370" y="130" width="440" height="560" rx="10" fill="${p.paper}"/>
      <rect x="370" y="130" width="440" height="80" rx="10" fill="${NAVY}"/><rect x="370" y="180" width="440" height="30" fill="${NAVY}"/>
      ${text(400, 182, 28, '#fff', 'Kumar Electronics', 800, 'start')}
      ${text(780, 250, 22, MAGENTA, 'No. 0042', 800, 'end')}
      ${Array.from({ length: 9 }, (_, i) => `<line x1="400" y1="${300 + i * 38}" x2="780" y2="${300 + i * 38}" stroke="${LINE}" stroke-width="3"/>`).join('')}
      <line x1="660" y1="280" x2="660" y2="610" stroke="${LINE}" stroke-width="3"/>
      ${text(780, 660, 26, INK, 'Total  ₹ 2,450', 800, 'end')}
      ${Array.from({ length: 10 }, (_, i) => `<circle cx="${400 + i * 42}" cy="690" r="5" fill="#A9B3C4"/>`).join('')}
    </g>`,
  envelope: (p) => `<g filter="url(#sh)">
      <rect x="220" y="260" width="760" height="400" rx="12" fill="${p.paper}" transform="rotate(-4 600 460)"/>
      <rect x="250" y="230" width="760" height="400" rx="12" fill="${p.paper}"/>
      <path d="M250 242 L630 460 L1010 242" fill="none" stroke="${LINE}" stroke-width="5"/>
      ${mark(290, 270, 76)}
      ${text(380, 305, 24, INK, 'Kumar Electronics', 800, 'start')}
      ${lines(660, 500, 3, 280, '#C9CFD9', 30, 12)}
      <rect x="900" y="270" width="80" height="96" rx="6" fill="${AMBER}"/>
    </g>`,
  certificate: (p) => `<g filter="url(#sh)">
      <rect x="200" y="200" width="800" height="520" rx="10" fill="${p.paper}"/>
      <rect x="225" y="225" width="750" height="470" rx="6" fill="none" stroke="${NAVY}" stroke-width="8"/>
      <rect x="240" y="240" width="720" height="440" rx="4" fill="none" stroke="${AMBER}" stroke-width="3"/>
      ${text(600, 320, 54, NAVY, 'CERTIFICATE', 800)}${text(600, 362, 24, MUTED, 'OF APPRECIATION', 600)}
      ${text(600, 440, 40, INK, 'Aarav Sharma', 700)}
      ${lines(420, 480, 2, 360, LINE, 28, 10)}
      <circle cx="830" cy="600" r="56" fill="${AMBER}"/><circle cx="830" cy="600" r="40" fill="none" stroke="#fff" stroke-width="4"/>
      <path d="M800 650 L790 720 L830 700 L870 720 L860 650" fill="${MAGENTA}"/>
      <line x1="320" y1="630" x2="520" y2="630" stroke="${INK}" stroke-width="3"/>
    </g>`,
  invitation: () => `<g filter="url(#sh)">
      <rect x="330" y="160" width="540" height="540" rx="12" fill="#8E1B3A"/>
      <rect x="360" y="190" width="480" height="480" rx="8" fill="${AMBER_TINT}" stroke="${AMBER}" stroke-width="6"/>
      <circle cx="600" cy="300" r="56" fill="none" stroke="${AMBER}" stroke-width="6"/>
      ${text(600, 420, 44, '#8E1B3A', 'Wedding')}${text(600, 470, 30, '#8A5300', 'Invitation', 400)}
      ${lines(470, 520, 3, 260, '#E8C88F', 30, 10)}
    </g>`,
  boxedInvite: () => `<g filter="url(#sh)">
      <rect x="300" y="300" width="600" height="380" rx="14" fill="#8E1B3A"/>
      <rect x="280" y="230" width="640" height="110" rx="14" fill="#A82348"/>
      <rect x="575" y="230" width="50" height="450" fill="${AMBER}"/>
      <path d="M600 230 q-90 -90 -130 -20 q40 50 130 20 q90 -90 130 -20 q-40 50 -130 20" fill="${AMBER}"/>
      <rect x="360" y="400" width="190" height="230" rx="8" fill="${AMBER_TINT}"/>${lines(385, 450, 5, 140, '#E8C88F', 30, 10)}
      ${text(455, 425, 20, '#8E1B3A', 'Shubh Vivah', 800)}
    </g>`,
  engagement: () => `<g filter="url(#sh)">
      <rect x="350" y="150" width="500" height="560" rx="14" fill="${AMBER_TINT}" stroke="${AMBER}" stroke-width="6"/>
      <circle cx="565" cy="320" r="70" fill="none" stroke="${AMBER}" stroke-width="16"/>
      <circle cx="635" cy="320" r="70" fill="none" stroke="#E08900" stroke-width="16"/>
      <path d="M620 238 l15 -24 l15 24 z" fill="${CYAN}"/>
      ${text(600, 470, 38, '#8E1B3A', 'Ring Ceremony')}
      ${lines(470, 520, 3, 260, '#E8C88F', 30, 10)}
    </g>`,
  saveDate: (p) => `<g filter="url(#sh)">
      <rect x="350" y="150" width="500" height="560" rx="14" fill="${p.paper}"/>
      ${text(600, 250, 46, NAVY, 'Save the Date', 800)}
      <rect x="490" y="300" width="220" height="230" rx="16" fill="${TINT}"/>
      <rect x="490" y="300" width="220" height="60" rx="16" fill="${MAGENTA}"/><rect x="490" y="340" width="220" height="20" fill="${MAGENTA}"/>
      ${text(600, 343, 28, '#fff', 'FEBRUARY', 800)}${text(600, 470, 96, NAVY, '14', 800)}
      <path d="M600 640 c-40 -40 -80 -10 -60 25 l60 45 l60 -45 c20 -35 -20 -65 -60 -25 z" fill="${MAGENTA}"/>
    </g>`,
  shagun: () => `<g filter="url(#sh)">
      <rect x="300" y="250" width="600" height="400" rx="14" fill="#B4123E"/>
      <path d="M300 262 L600 470 L900 262" fill="#8E1B3A"/>
      <circle cx="600" cy="470" r="70" fill="${AMBER}"/><circle cx="600" cy="470" r="52" fill="none" stroke="#fff" stroke-width="4"/>
      ${text(600, 488, 40, '#8E1B3A', '₹', 800)}
      ${text(600, 610, 34, AMBER, 'SHAGUN', 800)}
    </g>`,
  welcomeBoard: () => `<g filter="url(#sh)">
      <path d="M470 700 L560 160 M730 700 L640 160 M600 160 L600 720" stroke="#6B4226" stroke-width="18"/>
      <rect x="380" y="180" width="440" height="420" rx="14" fill="${AMBER_TINT}" stroke="${AMBER}" stroke-width="8"/>
      ${text(600, 290, 50, '#8E1B3A', 'Welcome', 800)}
      ${text(600, 380, 40, INK, 'Riya ♥ Aman', 700)}
      ${lines(470, 430, 3, 260, '#E8C88F', 34, 12)}
    </g>`,
  birthday: (p) => `<g filter="url(#sh)">
      <path d="M470 330 L470 520 M600 300 L600 520 M730 330 L730 520" stroke="#A9B3C4" stroke-width="4"/>
      <ellipse cx="470" cy="270" rx="60" ry="72" fill="${CYAN}"/><ellipse cx="600" cy="230" rx="64" ry="76" fill="${MAGENTA}"/><ellipse cx="730" cy="270" rx="60" ry="72" fill="${AMBER}"/>
      <rect x="360" y="460" width="480" height="250" rx="14" fill="${p.paper}"/>
      ${text(600, 540, 44, NAVY, "You're invited!", 800)}${text(600, 590, 28, MUTED, "Aarav's 7th Birthday", 600)}
      ${lines(470, 625, 2, 260, LINE, 28, 10)}
    </g>`,
  greeting: () => `<g filter="url(#sh)">
      <rect x="350" y="150" width="500" height="560" rx="14" fill="${NAVY}"/>
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${390 + ((i * 97) % 420)}" cy="${190 + ((i * 53) % 220)}" r="${3 + (i % 3)}" fill="${AMBER}"/>`).join('')}
      <path d="M520 470 q80 70 160 0 q-10 50 -80 50 q-70 0 -80 -50 z" fill="${AMBER}"/>
      <path d="M600 470 q-30 -40 0 -100 q30 60 0 100 z" fill="#FFC861"/>
      ${text(600, 600, 46, '#fff', 'Happy Diwali', 800)}${text(600, 650, 24, AMBER, 'Warm wishes from us', 600)}
    </g>`,
  stickers: () => `<g filter="url(#sh)">
      <circle cx="470" cy="370" r="160" fill="${CYAN}"/>${text(470, 390, 54, '#fff', 'LOGO', 800)}
      <rect x="610" y="260" width="300" height="300" rx="60" fill="${MAGENTA}"/>${text(760, 425, 48, '#fff', 'SALE', 800)}
      <circle cx="560" cy="610" r="90" fill="${AMBER}"/>${text(560, 625, 34, NAVY, 'NEW', 800)}
    </g>`,
  feeCard: (p) => `<g filter="url(#sh)">
      <rect x="260" y="200" width="680" height="480" rx="18" fill="${p.paper}"/>
      <rect x="260" y="200" width="680" height="80" rx="18" fill="${NAVY}"/><rect x="260" y="250" width="680" height="30" fill="${NAVY}"/>
      ${text(300, 255, 32, '#fff', 'FEE RECORD · 2026-27', 700, 'start')}
      ${Array.from({ length: 9 }, (_, i) => `<line x1="300" y1="${330 + i * 36}" x2="900" y2="${330 + i * 36}" stroke="${LINE}" stroke-width="3"/>`).join('')}
      ${[420, 560, 720].map((x) => `<line x1="${x}" y1="300" x2="${x}" y2="618" stroke="${LINE}" stroke-width="3"/>`).join('')}
      ${[0, 1, 2, 3].map((i) => `<rect x="740" y="${312 + i * 36}" width="70" height="24" rx="12" fill="${CYAN_TINT}"/>`).join('')}
    </g>`,
  receiptBook: (p) => `<g filter="url(#sh)">
      <rect x="330" y="180" width="560" height="520" rx="12" fill="${TINT}" transform="rotate(4 610 440)"/>
      <rect x="310" y="160" width="560" height="520" rx="12" fill="${p.paper}"/>
      <rect x="310" y="160" width="40" height="520" rx="12" fill="${NAVY}"/>
      ${text(390, 230, 30, NAVY, 'FEE RECEIPT', 800, 'start')}${text(840, 230, 24, MAGENTA, 'No. 0128', 800, 'end')}
      ${lines(390, 280, 6, 420, LINE, 44, 12)}
      <rect x="390" y="560" width="200" height="70" rx="10" fill="${AMBER_TINT}"/>${text(490, 605, 26, INK, '₹ 4,500', 800)}
      <line x1="660" y1="610" x2="830" y2="610" stroke="${INK}" stroke-width="3"/>
    </g>`,
  reportCard: (p) => `<g filter="url(#sh)">
      <rect x="360" y="110" width="480" height="620" rx="14" fill="${p.paper}"/>
      <rect x="360" y="110" width="480" height="110" rx="14" fill="${NAVY}"/><rect x="360" y="190" width="480" height="30" fill="${NAVY}"/>
      ${text(600, 168, 30, '#fff', 'PROGRESS REPORT', 800)}${text(600, 205, 18, CYAN, 'Class 6 · 2026-27', 600)}
      ${['English', 'Maths', 'Science', 'Hindi', 'Social Sc.'].map((s, i) => `
        <line x1="390" y1="${290 + i * 70}" x2="810" y2="${290 + i * 70}" stroke="${LINE}" stroke-width="3"/>
        ${text(400, 275 + i * 70, 26, INK, s, 600, 'start')}
        <rect x="720" y="${245 + i * 70}" width="76" height="40" rx="20" fill="${i % 2 ? CYAN_TINT : AMBER_TINT}"/>${text(758, 274 + i * 70, 24, NAVY, ['A+', 'A', 'A+', 'B+', 'A'][i]!, 800)}`).join('')}
      ${text(600, 690, 24, MUTED, 'Result: Promoted', 700)}
    </g>`,
  diary: () => `<g filter="url(#sh)">
      <rect x="400" y="130" width="420" height="580" rx="16" fill="#ffffff" transform="rotate(3 610 420)"/>
      <rect x="380" y="120" width="420" height="580" rx="16" fill="${NAVY}"/>
      <rect x="380" y="120" width="40" height="580" rx="16" fill="${NAVY_DEEP}"/>
      <circle cx="610" cy="280" r="64" fill="#ffffff"/>${text(610, 296, 36, NAVY, 'SPS', 800)}
      ${text(610, 420, 40, '#ffffff', 'SCHOOL', 800)}${text(610, 470, 40, '#ffffff', 'DIARY', 800)}
      <rect x="500" y="520" width="220" height="50" rx="25" fill="${AMBER}"/>${text(610, 554, 24, NAVY, '2026-27', 800)}
    </g>`,
  pamphlet: (p) => `<g filter="url(#sh)">
      <path d="M260 220 L460 180 L460 700 L260 660 Z" fill="${p.paper}"/>
      <path d="M460 180 L740 220 L740 700 L460 700 Z" fill="#F5F7FB"/>
      <path d="M740 220 L940 180 L940 660 L740 700 Z" fill="${p.paper}"/>
      <path d="M460 180 L740 220 L740 360 L460 330 Z" fill="${NAVY}"/>
      ${text(600, 290, 30, '#fff', 'ADMISSIONS', 800)}
      ${lines(290, 260, 8, 140, LINE, 44, 12)}${lines(490, 400, 6, 220, '#C9CFD9', 40, 12)}${lines(770, 260, 8, 140, LINE, 44, 12)}
      <rect x="780" y="580" width="130" height="44" rx="22" fill="${AMBER}"/>${text(845, 610, 18, NAVY, 'OPEN NOW', 800)}
    </g>`,
  homework: (p) => `<g filter="url(#sh)">
      <rect x="400" y="140" width="420" height="570" rx="10" fill="${p.paper}" transform="rotate(5 610 425)"/>
      <rect x="380" y="130" width="420" height="570" rx="10" fill="${CYAN}"/>
      <circle cx="700" cy="230" r="60" fill="${AMBER}"/>
      ${text(590, 360, 44, '#ffffff', 'HOLIDAY', 800)}${text(590, 415, 44, '#ffffff', 'HOMEWORK', 800)}
      <rect x="440" y="470" width="300" height="56" rx="28" fill="${NAVY}"/>${text(590, 507, 24, '#ffffff', 'Summer 2027', 700)}
      ${lines(440, 570, 3, 300, '#ffffff', 30, 10)}
    </g>`,
};

/** Each product its own picture; the PVC and school cards say which one they are. */
const PRODUCT_MOCKUP: Record<string, [string, string?]> = {
  'aadhaar-pvc-card': ['idCard', 'AADHAAR'],
  'pan-pvc-card': ['idCard', 'PAN'],
  'voter-id-pvc-card': ['idCard', 'VOTER ID'],
  'ration-pvc-card': ['idCard', 'RATION'],
  'driving-licence-pvc-card': ['idCard', 'LICENCE'],
  'notes-print-bw': ['document'],
  'colour-notes-print': ['colourNotes'],
  'ppt-print': ['slides'],
  'spiral-notebook': ['spiral'],
  'passport-size-photos': ['photos'],
  'name-slip-with-photo': ['nameSlip'],
  'project-file-viva': ['projectFile'],
  'photo-keychain': ['keychain'],
  'photo-frame': ['frame'],
  'photo-print-4x6': ['prints4x6'],
  'photo-print-a4': ['photoA4'],
  'poster-print-a3': ['posterA3'],
  'photo-calendar': ['calendar'],
  'visiting-card': ['visitingCard'],
  'hand-bill': ['flyer'],
  'logo-keychain': ['logoKeychain'],
  'logo-sticker': ['stickers'],
  'flex-banner': ['banner'],
  'roll-up-standee': ['standee'],
  letterhead: ['letterhead'],
  'bill-book': ['billBook'],
  'printed-envelope': ['envelope'],
  'certificate-print': ['certificate'],
  'wedding-card': ['invitation'],
  'premium-boxed-wedding-card': ['boxedInvite'],
  'engagement-invitation': ['engagement'],
  'save-the-date-card': ['saveDate'],
  'shagun-envelope': ['shagun'],
  'wedding-welcome-board': ['welcomeBoard'],
  'birthday-invitation': ['birthday'],
  'festival-greeting-card': ['greeting'],
  'student-id-card': ['schoolId', 'STUDENT'],
  'teacher-id-card': ['schoolId', 'TEACHER'],
  'out-pass-card': ['schoolId', 'OUT PASS'],
  'school-medal': ['medal'],
  'school-shield': ['shield'],
  'school-tie': ['tie'],
  'school-belt': ['belt'],
  'school-diary': ['diary'],
  'report-card': ['reportCard'],
  'fee-card': ['feeCard'],
  'fee-receipt-book': ['receiptBook'],
  'school-pamphlet': ['pamphlet'],
  'summer-homework-booklet': ['homework'],
};

/** Products added later fall back on their name. */
function mockupFor(slug: string, category: string): [string, string?] {
  const known = PRODUCT_MOCKUP[slug];
  if (known) return known;
  if (category === 'pvc-cards') return ['idCard'];
  if (/id-card/.test(slug)) return ['schoolId'];
  if (/diary/.test(slug)) return ['diary'];
  if (/spiral|notebook/.test(slug)) return ['spiral'];
  if (/passport/.test(slug)) return ['photos'];
  if (/keychain/.test(slug)) return ['keychain'];
  if (/frame/.test(slug)) return ['frame'];
  if (/medal/.test(slug)) return ['medal'];
  if (/shield|trophy/.test(slug)) return ['shield'];
  if (/visiting/.test(slug)) return ['visitingCard'];
  if (/banner|flex/.test(slug)) return ['banner'];
  if (/standee/.test(slug)) return ['standee'];
  if (/poster/.test(slug)) return ['posterA3'];
  if (/bill|pamphlet|flyer/.test(slug)) return ['flyer'];
  if (/envelope/.test(slug)) return ['envelope'];
  if (/certificate/.test(slug)) return ['certificate'];
  if (/invitation|wedding/.test(slug)) return ['invitation'];
  if (/calendar/.test(slug)) return ['calendar'];
  if (/photo/.test(slug)) return ['prints4x6'];
  if (/sticker/.test(slug)) return ['stickers'];
  if (/report/.test(slug)) return ['reportCard'];
  if (/receipt/.test(slug)) return ['receiptBook'];
  if (/fee/.test(slug)) return ['feeCard'];
  return ['document'];
}

const CATEGORY_MOCKUP: Record<string, string> = {
  'pvc-cards': 'idCard',
  'student-printing': 'spiral',
  gifts: 'frame',
  'school-works': 'schoolId',
  'business-works': 'visitingCard',
  'wedding-invitations': 'invitation',
  'photo-printing': 'prints4x6',
  'banners-signage': 'banner',
  'office-stationery': 'letterhead',
};

/** A generated sample (ours to redraw), as opposed to a photo uploaded in the admin panel. */
const isSample = (url: string) => url.includes('/catalog/samples/');

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
  let kept = 0;
  for (const product of await ProductModel.find()) {
    // Real photos stay unless --force; samples (or no picture at all) are redrawn.
    if (!force && product.images.some((u) => !isSample(u))) {
      kept += 1;
      continue;
    }
    const [kind, label] = mockupFor(product.slug, slugById.get(String(product.category)) ?? '');
    const urls: string[] = [];
    for (const [i, palette] of PALETTES.entries()) {
      urls.push(await upload(`catalog/samples/${product.slug}-${i + 1}.webp`, await render(frame(palette, MOCKUPS[kind]!(palette, label), product.name.en))));
    }
    product.images = urls;
    await product.save();
    products += 1;
  }

  let cats = 0;
  for (const category of categories) {
    if (!force && category.imageUrl && !isSample(category.imageUrl)) continue;
    const kind = CATEGORY_MOCKUP[category.slug] ?? 'document';
    const palette = PALETTES[0];
    category.imageUrl = await upload(`catalog/samples/category-${category.slug}.webp`, await render(frame(palette, MOCKUPS[kind]!(palette), category.name.en)));
    await category.save();
    cats += 1;
  }

  console.log(`Sample images drawn: ${products} products, ${cats} categories (${kept} products with real photos left as they are)`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
