import type { PDFFont } from 'pdf-lib';

/**
 * Standard PDF fonts only cover WinAnsi (Latin-1). Map common typography to ASCII and drop
 * anything else (e.g. Devanagari), so a Hindi-only name never crashes PDF generation.
 */
export function winAnsi(input: unknown) {
  return String(input ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[×✕]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Greedy word wrap to a maximum width in points. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = winAnsi(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    // A single word longer than the column is hard-broken.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Fits a single line into a width by shrinking the font size, then truncating. */
export function fitText(text: string, font: PDFFont, size: number, maxWidth: number, minSize = 5) {
  let s = size;
  const clean = winAnsi(text);
  while (s > minSize && font.widthOfTextAtSize(clean, s) > maxWidth) s -= 0.25;
  let out = clean;
  if (font.widthOfTextAtSize(out, s) > maxWidth) {
    while (out.length > 1 && font.widthOfTextAtSize(`${out}..`, s) > maxWidth) out = out.slice(0, -1);
    out = `${out.trimEnd()}..`;
  }
  return { text: out, size: s };
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number) {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ');
}

/** Indian numbering: 1,23,45,678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight". */
export function numberToWordsIndian(value: number) {
  let n = Math.floor(value);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}

export function rupeesInWords(amount: number) {
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);
  return `Rupees ${numberToWordsIndian(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}

export function rs(value: number) {
  return `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const MM = 72 / 25.4;
