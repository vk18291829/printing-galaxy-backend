import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import sharp from 'sharp';
import { fitText, MM, winAnsi, wrapText } from '@/modules/invoices/pdf-text';
import { FIELD_LABELS, KIND_SPECS, type CardKind, type FieldKey } from './card-kinds';

export const BLEED_MM = 3;
const SHEET = { w: 210, h: 297 }; // A4
const MARGIN_MM = 7;
const GAP_MM = 2;
const PHOTO_DPI = 300;

export interface CardTemplate {
  kind: CardKind;
  orientation: 'landscape' | 'portrait';
  colors: { primary: string; accent: string; text: string };
  headerText: string;
  subText?: string;
  fields: FieldKey[];
  backText?: string;
  signatureLabel?: string;
  validUpto?: string;
  institutionPhone?: string;
}

export interface CardRecord {
  data: Record<string, string>;
  photo?: Uint8Array;
}

const hexToRgb = (hex: string): RGB => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.4, 0.43, 0.48);
const HAIR = rgb(0.75, 0.78, 0.82);
const REG = rgb(0, 0, 0);

export function cardSize(kind: CardKind, orientation: 'landscape' | 'portrait') {
  const { w, h } = KIND_SPECS[kind].size;
  return orientation === 'portrait' ? { w: h, h: w } : { w, h };
}

/** Photo box in mm, relative to the card's design unit. */
function photoBox(orientation: 'landscape' | 'portrait', u: number) {
  return orientation === 'portrait' ? { w: 22 * u, h: 27.5 * u } : { w: 20 * u, h: 25 * u };
}

/** How many cards (with bleed) fit on A4 portrait or landscape, whichever holds more. */
export function sheetLayout(card: { w: number; h: number }) {
  const cw = card.w + 2 * BLEED_MM;
  const ch = card.h + 2 * BLEED_MM;
  const fit = (sw: number, sh: number) => {
    const cols = Math.max(1, Math.floor((sw - 2 * MARGIN_MM + GAP_MM) / (cw + GAP_MM)));
    const rows = Math.max(1, Math.floor((sh - 2 * MARGIN_MM + GAP_MM) / (ch + GAP_MM)));
    return { sheetW: sw, sheetH: sh, cols, rows, perSheet: cols * rows };
  };
  const portrait = fit(SHEET.w, SHEET.h);
  const landscape = fit(SHEET.h, SHEET.w);
  const best = landscape.perSheet > portrait.perSheet ? landscape : portrait;
  const gridW = best.cols * cw + (best.cols - 1) * GAP_MM;
  const gridH = best.rows * ch + (best.rows - 1) * GAP_MM;
  return { ...best, cw, ch, originX: (best.sheetW - gridW) / 2, originY: (best.sheetH - gridH) / 2 };
}

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  t: CardTemplate;
  logo?: PDFImage;
  primary: RGB;
  accent: RGB;
  ink: RGB;
}

const m = (mm: number) => mm * MM;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: RGB) {
  ctx.page.drawRectangle({ x: m(x), y: m(y), width: m(w), height: m(h), color });
}

function txt(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: { size: number; bold?: boolean; color?: RGB; maxW?: number; align?: 'left' | 'center' | 'right' },
) {
  const font = opts.bold ? ctx.bold : ctx.font;
  const fitted = opts.maxW ? fitText(value, font, opts.size, m(opts.maxW)) : { text: winAnsi(value), size: opts.size };
  if (!fitted.text) return;
  const width = font.widthOfTextAtSize(fitted.text, fitted.size);
  const dx = opts.align === 'center' ? width / 2 : opts.align === 'right' ? width : 0;
  ctx.page.drawText(fitted.text, { x: m(x) - dx, y: m(y), size: fitted.size, font, color: opts.color ?? ctx.ink });
}

function drawLogo(ctx: Ctx, cx: number, cy: number, size: number) {
  ctx.page.drawRectangle({ x: m(cx - size / 2), y: m(cy - size / 2), width: m(size), height: m(size), color: WHITE, borderColor: WHITE, borderWidth: 0.5 });
  if (!ctx.logo) return;
  const inner = size * 0.88;
  const scale = Math.min(m(inner) / ctx.logo.width, m(inner) / ctx.logo.height);
  const w = ctx.logo.width * scale;
  const h = ctx.logo.height * scale;
  ctx.page.drawImage(ctx.logo, { x: m(cx) - w / 2, y: m(cy) - h / 2, width: w, height: h });
}

function drawPhoto(ctx: Ctx, photo: PDFImage | undefined, x: number, y: number, w: number, h: number) {
  if (photo) {
    ctx.page.drawImage(photo, { x: m(x), y: m(y), width: m(w), height: m(h) });
  } else {
    rect(ctx, x, y, w, h, rgb(0.93, 0.94, 0.96));
    txt(ctx, 'PHOTO', x + w / 2, y + h / 2 - 1, { size: 6, color: MUTED, align: 'center' });
  }
  ctx.page.drawRectangle({ x: m(x), y: m(y), width: m(w), height: m(h), borderColor: ctx.primary, borderWidth: 0.8 });
}

/** Card types where photos are optional drop the box entirely when there is none. */
const showPhoto = (ctx: Ctx, photo: PDFImage | undefined) => Boolean(photo) || KIND_SPECS[ctx.t.kind].photoRequired;

function fieldValue(record: CardRecord, key: FieldKey) {
  if (key === 'class' && record.data.section) return `${record.data.class ?? ''} - ${record.data.section}`;
  return record.data[key] ?? '';
}

/** Fields to print: the template's choice, skipping ones this person has no value for. */
function printable(ctx: Ctx, record: CardRecord, max: number) {
  return ctx.t.fields
    .filter((f) => f !== 'name' && f !== 'photo' && !(f === 'section' && ctx.t.fields.includes('class')))
    .map((f) => ({ label: f === 'class' && record.data.section ? 'Class' : FIELD_LABELS[f], value: fieldValue(record, f) }))
    .filter((f) => f.value)
    .slice(0, max);
}

function signature(ctx: Ctx, right: number, y: number, u: number) {
  if (!ctx.t.signatureLabel) return;
  ctx.page.drawLine({ start: { x: m(right - 16 * u), y: m(y + 2.6 * u) }, end: { x: m(right), y: m(y + 2.6 * u) }, thickness: 0.4, color: MUTED });
  txt(ctx, ctx.t.signatureLabel, right - 8 * u, y, { size: 4.6 * u, color: MUTED, align: 'center' });
}

function footer(ctx: Ctx, x: number, y: number, w: number, u: number, center: boolean) {
  const b = BLEED_MM;
  rect(ctx, x - b, y - b, w + 2 * b, 5 * u + b, ctx.primary);
  const badge = KIND_SPECS[ctx.t.kind].badge;
  const validity = ctx.t.validUpto ? `Valid upto ${ctx.t.validUpto}` : '';
  if (center) {
    txt(ctx, [badge, validity].filter(Boolean).join('  |  '), x + w / 2, y + 1.6 * u, { size: 5.4 * u, bold: true, color: WHITE, align: 'center', maxW: w - 4 });
  } else {
    txt(ctx, badge, x + 3 * u, y + 1.6 * u, { size: 5.8 * u, bold: true, color: WHITE });
    if (validity) txt(ctx, validity, x + w - 3 * u, y + 1.6 * u, { size: 4.8 * u, color: WHITE, align: 'right' });
  }
}

function frontLandscape(ctx: Ctx, record: CardRecord, photo: PDFImage | undefined, x: number, y: number, w: number, h: number) {
  const u = h / 54;
  const b = BLEED_MM;
  const band = 13 * u;
  rect(ctx, x - b, y + h - band, w + 2 * b, band + b, ctx.primary);
  rect(ctx, x - b, y + h - band - 1.2 * u, w + 2 * b, 1.2 * u, ctx.accent);
  drawLogo(ctx, x + 8 * u, y + h - band / 2, 10 * u);
  const textX = x + 15 * u;
  const textW = w - 15 * u - 3 * u;
  txt(ctx, ctx.t.headerText, textX, y + h - 6.2 * u, { size: 9 * u, bold: true, color: WHITE, maxW: textW });
  if (ctx.t.subText) txt(ctx, ctx.t.subText, textX, y + h - 10.2 * u, { size: 5.2 * u, color: WHITE, maxW: textW });

  const pb = photoBox('landscape', u);
  // Centred between the header stripe and the footer band.
  const photoY = y + 10 * u;
  const withPhoto = showPhoto(ctx, photo);
  if (withPhoto) drawPhoto(ctx, photo, x + 3 * u, photoY, pb.w, pb.h);

  const colX = withPhoto ? x + 3 * u + pb.w + 3 * u : x + 4 * u;
  const colW = x + w - 3 * u - colX;
  txt(ctx, record.data.name ?? '', colX, photoY + pb.h - 3 * u, { size: 9 * u, bold: true, color: ctx.primary, maxW: colW });
  const labelW = 16 * u;
  printable(ctx, record, 5).forEach((f, i) => {
    const rowY = photoY + pb.h - 7.4 * u - i * 3.6 * u;
    txt(ctx, f.label, colX, rowY, { size: 5.2 * u, bold: true, color: MUTED, maxW: labelW - 1 });
    txt(ctx, f.value, colX + labelW, rowY, { size: 6.2 * u, maxW: colW - labelW });
  });
  signature(ctx, x + w - 3 * u, y + 6.2 * u, u);
  footer(ctx, x, y, w, u, false);
}

function frontPortrait(ctx: Ctx, record: CardRecord, photo: PDFImage | undefined, x: number, y: number, w: number, h: number) {
  const u = w / 54;
  const b = BLEED_MM;
  const band = 20.5 * u;
  rect(ctx, x - b, y + h - band, w + 2 * b, band + b, ctx.primary);
  rect(ctx, x - b, y + h - band - 1 * u, w + 2 * b, 1 * u, ctx.accent);
  drawLogo(ctx, x + w / 2, y + h - 7 * u, 9 * u);
  txt(ctx, ctx.t.headerText, x + w / 2, y + h - 15 * u, { size: 8 * u, bold: true, color: WHITE, maxW: w - 5 * u, align: 'center' });
  if (ctx.t.subText) txt(ctx, ctx.t.subText, x + w / 2, y + h - 18.6 * u, { size: 4.8 * u, color: WHITE, maxW: w - 5 * u, align: 'center' });

  const pb = photoBox('portrait', u);
  const photoTop = y + h - band - 3.2 * u;
  const withPhoto = showPhoto(ctx, photo);
  if (withPhoto) drawPhoto(ctx, photo, x + (w - pb.w) / 2, photoTop - pb.h, pb.w, pb.h);
  const nameY = withPhoto ? photoTop - pb.h - 4.6 * u : photoTop - 6 * u;
  txt(ctx, record.data.name ?? '', x + w / 2, nameY, { size: 8.6 * u, bold: true, color: ctx.primary, maxW: w - 6 * u, align: 'center' });

  const labelX = x + 4 * u;
  const valueX = x + 20 * u;
  printable(ctx, record, 5).forEach((f, i) => {
    const rowY = nameY - 4.4 * u - i * 3.4 * u;
    txt(ctx, f.label, labelX, rowY, { size: 5 * u, bold: true, color: MUTED, maxW: valueX - labelX - 1 });
    txt(ctx, f.value, valueX, rowY, { size: 6 * u, maxW: x + w - 4 * u - valueX });
  });
  signature(ctx, x + w - 3.5 * u, y + 6.3 * u, u);
  footer(ctx, x, y, w, u, true);
}

function back(ctx: Ctx, record: CardRecord, x: number, y: number, w: number, h: number) {
  const portrait = h > w;
  const u = portrait ? w / 54 : h / 54;
  const b = BLEED_MM;
  rect(ctx, x - b, y + h - 4 * u, w + 2 * b, 4 * u + b, ctx.primary);
  rect(ctx, x - b, y - b, w + 2 * b, 2.5 * u + b, ctx.primary);
  const pad = 4 * u;
  const innerW = w - 2 * pad;
  let cy = y + h - 9 * u;

  if (ctx.t.kind === 'fee_card') {
    txt(ctx, 'FEE RECORD', x + pad, cy, { size: 8 * u, bold: true, color: ctx.primary });
    txt(ctx, `${record.data.name ?? ''}  |  Adm. No. ${record.data.admissionNo ?? ''}`, x + w - pad, cy, { size: 5.5 * u, align: 'right', maxW: innerW * 0.6 });
    cy -= 3.5 * u;
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const cols = [{ l: 'Month', w: 0.16 }, { l: 'Fee (Rs)', w: 0.18 }, { l: 'Paid on', w: 0.22 }, { l: 'Receipt no.', w: 0.24 }, { l: 'Sign', w: 0.2 }];
    const rowH = (cy - (y + 6 * u)) / (months.length + 1);
    const top = cy;
    for (let r = 0; r <= months.length + 1; r += 1) {
      const ly = top - r * rowH;
      ctx.page.drawLine({ start: { x: m(x + pad), y: m(ly) }, end: { x: m(x + w - pad), y: m(ly) }, thickness: r === 0 || r === 1 ? 0.6 : 0.3, color: r <= 1 ? ctx.primary : HAIR });
    }
    let cx = x + pad;
    cols.forEach((c, i) => {
      txt(ctx, c.l, cx + 1.2 * u, top - rowH + rowH * 0.3, { size: 5.2 * u, bold: true, color: ctx.primary });
      if (i > 0) ctx.page.drawLine({ start: { x: m(cx), y: m(top) }, end: { x: m(cx), y: m(top - rowH * (months.length + 1)) }, thickness: 0.3, color: HAIR });
      cx += innerW * c.w;
    });
    months.forEach((mo, i) => txt(ctx, mo, x + pad + 1.2 * u, top - rowH * (i + 2) + rowH * 0.3, { size: 5.4 * u }));
    return;
  }

  if (ctx.t.kind === 'out_pass') {
    txt(ctx, 'OUT PASS RECORD', x + pad, cy, { size: 6.5 * u, bold: true, color: ctx.primary });
    cy -= 2.5 * u;
    const heads = ['Date', 'Out', 'In', 'Reason', 'Sign'];
    const widths = [0.2, 0.14, 0.14, 0.32, 0.2];
    const rows = portrait ? 9 : 5;
    const rowH = (cy - (y + 12 * u)) / (rows + 1);
    for (let r = 0; r <= rows + 1; r += 1) {
      const ly = cy - r * rowH;
      ctx.page.drawLine({ start: { x: m(x + pad), y: m(ly) }, end: { x: m(x + w - pad), y: m(ly) }, thickness: r <= 1 ? 0.5 : 0.25, color: r <= 1 ? ctx.primary : HAIR });
    }
    let cx = x + pad;
    heads.forEach((hd, i) => {
      txt(ctx, hd, cx + 0.8 * u, cy - rowH + rowH * 0.3, { size: 4.6 * u, bold: true, color: ctx.primary });
      cx += innerW * widths[i]!;
    });
    cy -= rowH * (rows + 1) + 3.4 * u;
  } else {
    txt(ctx, 'IF FOUND, PLEASE RETURN TO', x + w / 2, cy, { size: 5.2 * u, bold: true, color: MUTED, align: 'center' });
    cy -= 4.4 * u;
    txt(ctx, ctx.t.headerText, x + w / 2, cy, { size: 7.6 * u, bold: true, color: ctx.primary, align: 'center', maxW: innerW });
    cy -= 3.6 * u;
    for (const line of wrapText(ctx.t.subText ?? '', ctx.font, 5.4 * u, m(innerW)).slice(0, 2)) {
      txt(ctx, line, x + w / 2, cy, { size: 5.4 * u, align: 'center' });
      cy -= 2.8 * u;
    }
    if (ctx.t.institutionPhone) {
      txt(ctx, `Phone: ${ctx.t.institutionPhone}`, x + w / 2, cy, { size: 5.4 * u, align: 'center' });
      cy -= 2.8 * u;
    }
    ctx.page.drawLine({ start: { x: m(x + pad), y: m(cy) }, end: { x: m(x + w - pad), y: m(cy) }, thickness: 0.3, color: HAIR });
    cy -= 3.6 * u;
    const details: [string, string | undefined][] = [
      ['Address', record.data.address],
      [ctx.t.kind === 'teacher_id' ? 'Phone' : 'Emergency', record.data.phone],
      ['Blood Group', ctx.t.fields.includes('bloodGroup') ? undefined : record.data.bloodGroup],
    ];
    for (const [label, value] of details) {
      if (!value) continue;
      txt(ctx, label, x + pad, cy, { size: 5 * u, bold: true, color: MUTED });
      const lines = wrapText(value, ctx.font, 5.4 * u, m(innerW - 15 * u)).slice(0, 2);
      lines.forEach((line, i) => txt(ctx, line, x + pad + 15 * u, cy - i * 2.6 * u, { size: 5.4 * u }));
      cy -= 2.6 * u * lines.length + 1 * u;
    }
  }

  if (ctx.t.backText) {
    const size = 4.8 * u;
    const lines = wrapText(ctx.t.backText, ctx.font, size, m(innerW));
    const room = Math.max(0, Math.floor((cy - (y + 4 * u)) / (2.4 * u)));
    lines.slice(0, room).forEach((line, i) => txt(ctx, line, x + w / 2, cy - i * 2.4 * u, { size, color: MUTED, align: 'center' }));
  }
}

function cropMarks(page: PDFPage, layout: ReturnType<typeof sheetLayout>, card: { w: number; h: number }) {
  const { cols, rows, cw, ch, originX, originY } = layout;
  const gridW = cols * cw + (cols - 1) * GAP_MM;
  const gridH = rows * ch + (rows - 1) * GAP_MM;
  const len = 3;
  const off = 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    const left = originX + c * (cw + GAP_MM) + BLEED_MM;
    xs.push(left, left + card.w);
  }
  for (let r = 0; r < rows; r += 1) {
    const bottom = originY + r * (ch + GAP_MM) + BLEED_MM;
    ys.push(bottom, bottom + card.h);
  }
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: m(x1), y: m(y1) }, end: { x: m(x2), y: m(y2) }, thickness: 0.25, color: REG });
  for (const x of xs) {
    line(x, originY - off, x, originY - off - len);
    line(x, originY + gridH + off, x, originY + gridH + off + len);
  }
  for (const y of ys) {
    line(originX - off, y, originX - off - len, y);
    line(originX + gridW + off, y, originX + gridW + off + len, y);
  }
}

async function prepareLogo(pdf: PDFDocument, logo?: Buffer | Uint8Array | null) {
  if (!logo) return undefined;
  try {
    const png = await sharp(logo).rotate().resize(600, 600, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return await pdf.embedPng(png);
  } catch {
    return undefined;
  }
}

/** Crops to the photo box aspect (attention strategy keeps the face) at 300 DPI. */
async function preparePhoto(pdf: PDFDocument, bytes: Uint8Array | undefined, box: { w: number; h: number }) {
  if (!bytes) return undefined;
  try {
    const px = (mm: number) => Math.round((mm / 25.4) * PHOTO_DPI);
    const jpg = await sharp(bytes)
      .rotate()
      .resize(px(box.w), px(box.h), { fit: 'cover', position: sharp.strategy.attention })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return await pdf.embedJpg(jpg);
  } catch {
    return undefined;
  }
}

/**
 * Print-ready PDF: for every sheet a page of fronts, then a page of backs mirrored left-to-right
 * so they line up when printed duplex (flip on long edge). Each card is the exact trim size plus
 * 3 mm bleed; crop marks sit in the sheet margin on every trim line.
 */
export async function renderCardSheets(params: {
  template: CardTemplate;
  records: CardRecord[];
  logo?: Buffer | Uint8Array | null;
  title?: string;
  onProgress?: (done: number, total: number) => void;
}) {
  const { template, records } = params;
  const card = cardSize(template.kind, template.orientation);
  const layout = sheetLayout(card);
  const pdf = await PDFDocument.create();
  pdf.setTitle(params.title ?? `${KIND_SPECS[template.kind].label} print sheets`);
  pdf.setCreator('Printing Galaxy');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await prepareLogo(pdf, params.logo);
  const base = {
    font,
    bold,
    t: template,
    logo,
    primary: hexToRgb(template.colors.primary),
    accent: hexToRgb(template.colors.accent),
    ink: hexToRgb(template.colors.text),
  };
  const u = template.orientation === 'portrait' ? card.w / 54 : card.h / 54;
  const box = photoBox(template.orientation, u);
  const sheets = Math.ceil(records.length / layout.perSheet);

  for (let s = 0; s < sheets; s += 1) {
    const batch = records.slice(s * layout.perSheet, (s + 1) * layout.perSheet);
    const front = pdf.addPage([m(layout.sheetW), m(layout.sheetH)]);
    const backPage = pdf.addPage([m(layout.sheetW), m(layout.sheetH)]);
    const slug = (side: string) =>
      `${winAnsi(template.headerText)}  |  ${KIND_SPECS[template.kind].label}  |  Sheet ${s + 1}/${sheets} ${side}  |  ${card.w} x ${card.h} mm + ${BLEED_MM} mm bleed`;

    for (const [i, record] of batch.entries()) {
      // Rows fill from the top of the sheet.
      const col = i % layout.cols;
      const row = layout.rows - 1 - Math.floor(i / layout.cols);
      const trimX = (c: number) => layout.originX + c * (layout.cw + GAP_MM) + BLEED_MM;
      const trimY = layout.originY + row * (layout.ch + GAP_MM) + BLEED_MM;

      const photo = await preparePhoto(pdf, record.photo, box);
      const fctx: Ctx = { ...base, page: front };
      if (template.orientation === 'portrait') frontPortrait(fctx, record, photo, trimX(col), trimY, card.w, card.h);
      else frontLandscape(fctx, record, photo, trimX(col), trimY, card.w, card.h);

      back({ ...base, page: backPage }, record, trimX(layout.cols - 1 - col), trimY, card.w, card.h);
      params.onProgress?.(s * layout.perSheet + i + 1, records.length);
    }

    for (const [page, side] of [[front, 'front'], [backPage, 'back']] as const) {
      cropMarks(page, layout, card);
      // Below the crop marks; informational only, it may fall in the printer's unprintable edge.
      page.drawText(slug(side), { x: m(layout.originX), y: m(1.4), size: 5, font, color: MUTED });
    }
  }

  return { bytes: await pdf.save(), sheets, perSheet: layout.perSheet };
}
