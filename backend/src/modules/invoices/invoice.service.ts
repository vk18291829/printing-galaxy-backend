import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { financialYear, nextSequence } from '@/common/counter.model';
import { ApiError } from '@/common/errors';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { OrderModel, type OrderDoc } from '@/modules/orders/order.model';
import { round2 } from '@/modules/pricing/pricing.service';
import { getSettings, type Settings } from '@/modules/settings/settings.model';
import { rs, rupeesInWords, winAnsi, wrapText } from './pdf-text';

const NAVY = rgb(0.075, 0.102, 0.169);
const BLUE = rgb(0.114, 0.424, 0.941);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const STRIPE = rgb(0.965, 0.972, 0.984);

/** Gives the order a permanent invoice number (PG/2026-27/00001) the first time one is needed. */
export async function ensureInvoiceNumber(order: OrderDoc) {
  if (order.invoice?.number) return order.invoice.number;
  const fy = financialYear();
  const seq = await nextSequence(`invoice:${fy}`);
  const number = `PG/${fy}/${String(seq).padStart(5, '0')}`;
  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, 'invoice.number': { $exists: false } },
    { $set: { invoice: { number, issuedAt: new Date() } } },
    { new: true },
  );
  // Another request numbered it first; keep theirs.
  const fresh = updated ?? (await OrderModel.findById(order._id));
  order.set('invoice', fresh?.invoice);
  return fresh?.invoice?.number ?? number;
}

export function assertInvoiceable(order: OrderDoc) {
  if (order.status === 'cancelled') throw ApiError.conflict('Cancelled orders have no invoice');
  if (order.status === 'quote_pending') throw ApiError.conflict('The price for this order is not confirmed yet');
  if (order.status === 'quote_sent') throw ApiError.conflict('The invoice is available once the quote is accepted');
  if (order.status === 'awaiting_payment') throw ApiError.conflict('The invoice is available once the order is paid');
}

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function text(ctx: Ctx, value: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' } = {}) {
  const font = opts.bold ? ctx.bold : ctx.font;
  const size = opts.size ?? 9;
  const clean = winAnsi(value);
  const dx = opts.align === 'right' ? font.widthOfTextAtSize(clean, size) : 0;
  ctx.page.drawText(clean, { x: x - dx, y, size, font, color: opts.color ?? NAVY });
}

const fmtDate = (d?: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '-';

const sameState = (a?: string | null, b?: string | null) =>
  !a || !b || a.trim().toLowerCase() === b.trim().toLowerCase();

export async function renderInvoicePdf(order: OrderDoc, settingsArg?: Settings) {
  const settings = settingsArg ?? (await getSettings()).toObject();
  const institution = order.institution
    ? await InstitutionModel.findById(order.institution).select('name gstin address').lean()
    : null;

  const shop = settings.shop;
  const taxed = order.totals.tax > 0;
  const isTaxInvoice = taxed && Boolean(shop.gstin);
  const placeOfSupply = order.fulfilment?.address?.state || institution?.address?.state || shop.state || '';
  const intraState = sameState(shop.state, placeOfSupply);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${order.invoice?.number ?? order.orderNumber}`);
  pdf.setAuthor(winAnsi(shop.name));
  pdf.setCreator('Printing Galaxy');
  const page = pdf.addPage([595.28, 841.89]);
  const ctx: Ctx = { page, font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const W = page.getWidth();
  const L = 40;
  const R = W - 40;
  let y = 800;

  // ── Header ───────────────────────────────────────────────────────────────
  const cmyk = [rgb(0.07, 0.71, 0.92), rgb(0.85, 0.07, 0.54), rgb(1, 0.76, 0.05), NAVY];
  cmyk.forEach((c, i) => page.drawRectangle({ x: (W / 4) * i, y: 836, width: W / 4, height: 6, color: c }));

  text(ctx, shop.name || 'Printing Galaxy', L, y, { size: 18, bold: true });
  text(ctx, isTaxInvoice ? 'TAX INVOICE' : 'RECEIPT', R, y, { size: 14, bold: true, color: BLUE, align: 'right' });
  y -= 16;
  const shopLines = [
    ...wrapText(shop.address, ctx.font, 8.5, 280),
    [shop.phone && `Phone: +91 ${shop.phone}`, shop.email].filter(Boolean).join('  |  '),
    shop.gstin ? `GSTIN: ${shop.gstin}${shop.state ? `  |  State: ${shop.state}` : ''}` : '',
  ].filter(Boolean);
  const metaRows: [string, string][] = [
    [isTaxInvoice ? 'Invoice no.' : 'Receipt no.', order.invoice?.number ?? '-'],
    ['Date', fmtDate(order.invoice?.issuedAt ?? new Date())],
    ['Order no.', order.orderNumber],
    ['Order date', fmtDate(order.createdAt)],
  ];
  if (order.reference) metaRows.push(['Your ref.', order.reference]);
  if (isTaxInvoice && placeOfSupply) metaRows.push(['Place of supply', placeOfSupply]);

  let yl = y;
  for (const line of shopLines) {
    text(ctx, line, L, yl, { size: 8.5, color: MUTED });
    yl -= 11;
  }
  let yr = y;
  for (const [k, v] of metaRows) {
    text(ctx, k, R - 120, yr, { size: 8.5, color: MUTED });
    text(ctx, v, R, yr, { size: 8.5, bold: true, align: 'right' });
    yr -= 12;
  }
  y = Math.min(yl, yr) - 10;

  // ── Bill to ──────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.7, color: LINE });
  y -= 16;
  text(ctx, 'BILL TO', L, y, { size: 7.5, bold: true, color: MUTED });
  text(ctx, order.fulfilment?.method === 'delivery' ? 'DELIVER TO' : 'FULFILMENT', W / 2 + 10, y, { size: 7.5, bold: true, color: MUTED });
  y -= 13;
  const billTo = [
    institution?.name ?? order.contact?.name ?? '',
    institution ? order.contact?.name?.replace(/\s*\(.*\)$/, '') : '',
    order.contact?.phone ? `+91 ${order.contact.phone}` : '',
    order.contact?.email ?? '',
    institution?.gstin ? `GSTIN: ${institution.gstin}` : '',
  ].map(winAnsi).filter(Boolean);
  if (!billTo.length) billTo.push('Walk-in customer');
  const addr = order.fulfilment?.address;
  const shipTo = addr
    ? [addr.name ?? '', addr.line1, addr.line2 ?? '', `${addr.city}, ${addr.state} ${addr.pincode}`].map(winAnsi).filter(Boolean)
    : ['Pickup from shop'];
  const rows = Math.max(billTo.length, shipTo.length);
  for (let i = 0; i < rows; i += 1) {
    if (billTo[i]) text(ctx, billTo[i]!, L, y, { size: 9, bold: i === 0 });
    if (shipTo[i]) text(ctx, shipTo[i]!, W / 2 + 10, y, { size: 9 });
    y -= 12;
  }
  y -= 8;

  // ── Items ────────────────────────────────────────────────────────────────
  const cols = { n: L + 6, desc: L + 26, sac: 330, qty: 395, rate: 470, amt: R - 6 };
  page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 20, color: NAVY });
  const head = (label: string, x: number, align: 'left' | 'right' = 'left') =>
    text(ctx, label, x, y, { size: 8, bold: true, color: rgb(1, 1, 1), align });
  head('#', cols.n);
  head('Description', cols.desc);
  head('HSN/SAC', cols.sac);
  head('Qty', cols.qty + 30, 'right');
  head('Rate', cols.rate + 20, 'right');
  head('Amount', cols.amt, 'right');
  y -= 22;

  order.items.forEach((item, index) => {
    const size = item.customSize ? `Size: ${item.customSize.width} x ${item.customSize.height} ${item.customSize.unit}` : '';
    const opts = [size, ...item.options.map((o) => `${o.label?.en}: ${o.valueLabel?.en}`)].filter(Boolean).join(', ');
    const qtyLabel =
      item.unit === 'page'
        ? `${item.pageCount ?? 0} pages x ${item.copies}`
        : `${item.quantity} ${item.unit}`;
    const descLines = [
      ...wrapText(item.productName?.en || item.productSlug || 'Item', ctx.bold, 9, cols.sac - cols.desc - 10).map((t) => ({ t, b: true })),
      ...(opts ? wrapText(opts, ctx.font, 7.5, cols.sac - cols.desc - 10).map((t) => ({ t, b: false })) : []),
      ...(item.unit === 'page' ? [{ t: qtyLabel, b: false }] : []),
    ];
    const height = descLines.length * 11 + 8;
    if (index % 2 === 1) page.drawRectangle({ x: L, y: y - height + 12, width: R - L, height, color: STRIPE });

    text(ctx, String(index + 1), cols.n, y);
    descLines.forEach((l, i) => text(ctx, l.t, cols.desc, y - i * 11, { size: l.b ? 9 : 7.5, bold: l.b, color: l.b ? NAVY : MUTED }));
    text(ctx, settings.tax.sacCode || '9989', cols.sac, y);
    text(ctx, String(item.units), cols.qty + 30, y, { align: 'right' });
    text(ctx, rs(item.unitPrice), cols.rate + 20, y, { align: 'right' });
    text(ctx, rs(item.lineTotal), cols.amt, y, { bold: true, align: 'right' });
    if (item.fixedFees > 0 || item.discount > 0) {
      const extra = [item.fixedFees > 0 && `+ ${rs(item.fixedFees)} extras`, item.discount > 0 && `- ${rs(item.discount)} discount`]
        .filter(Boolean)
        .join('  ');
      text(ctx, extra, cols.amt, y - 11, { size: 7, color: MUTED, align: 'right' });
    }
    y -= height;
    // A very long order continues on a fresh page.
    if (y < 220 && index < order.items.length - 1) {
      const next = pdf.addPage([595.28, 841.89]);
      ctx.page = next;
      y = 800;
    }
  });

  ctx.page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.7, color: LINE });
  y -= 14;

  // ── Totals ───────────────────────────────────────────────────────────────
  const t = order.totals;
  const taxable = round2(t.total - t.tax);
  const totals: [string, string, boolean?][] = [['Subtotal', rs(t.subtotal)]];
  if (t.deliveryFee > 0) totals.push(['Delivery', rs(t.deliveryFee)]);
  if (taxed) {
    totals.push([settings.tax.pricesIncludeTax ? 'Taxable value (prices incl. GST)' : 'Taxable value', rs(taxable)]);
    if (intraState) {
      const half = round2(t.tax / 2);
      totals.push([`CGST @ ${t.taxRate / 2}%`, rs(half)]);
      totals.push([`SGST @ ${t.taxRate / 2}%`, rs(round2(t.tax - half))]);
    } else {
      totals.push([`IGST @ ${t.taxRate}%`, rs(t.tax)]);
    }
  }
  totals.push(['Total', rs(t.total), true]);
  const paid = order.payment?.amountPaid ?? 0;
  totals.push(['Paid', rs(paid)]);
  if (t.total - paid > 0.009) totals.push(['Balance due', rs(round2(t.total - paid)), true]);

  const startY = y;
  for (const [label, value, strong] of totals) {
    if (strong) {
      ctx.page.drawRectangle({ x: 330, y: y - 5, width: R - 330, height: 18, color: STRIPE });
    }
    text(ctx, label, 340, y, { size: strong ? 10 : 9, bold: strong, color: strong ? NAVY : MUTED });
    text(ctx, value, cols.amt, y, { size: strong ? 10 : 9, bold: strong, align: 'right' });
    y -= strong ? 20 : 14;
  }

  text(ctx, 'Amount in words', L, startY, { size: 7.5, bold: true, color: MUTED });
  wrapText(rupeesInWords(t.total), ctx.font, 9, 270).forEach((line, i) => text(ctx, line, L, startY - 13 - i * 11));
  const payLabel = order.payment?.method === 'online' ? 'Online (Razorpay)' : 'At counter';
  text(ctx, `Payment: ${payLabel} - ${order.payment?.status ?? 'pending'}`, L, startY - 50, { size: 8.5, color: MUTED });
  if (!isTaxInvoice) {
    text(ctx, shop.gstin ? 'GST is not charged on this receipt.' : 'Not a GST tax invoice.', L, startY - 63, { size: 8, color: MUTED });
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const fy = 60;
  ctx.page.drawLine({ start: { x: L, y: fy + 24 }, end: { x: R, y: fy + 24 }, thickness: 0.7, color: LINE });
  text(ctx, 'Thank you for choosing Printing Galaxy!', L, fy + 8, { size: 9, bold: true });
  text(ctx, 'This is a computer-generated document and does not need a signature.', L, fy - 4, { size: 7.5, color: MUTED });
  text(ctx, `For ${shop.name || 'Printing Galaxy'}`, R, fy + 8, { size: 8.5, align: 'right', color: MUTED });

  return pdf.save();
}

export function invoiceFileName(order: OrderDoc) {
  return `${(order.invoice?.number ?? order.orderNumber).replace(/\//g, '-')}.pdf`;
}
