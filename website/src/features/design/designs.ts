/**
 * Live previews for personalised products. Each design is drawn with Canvas 2D in millimetres,
 * so the same code paints the on-screen preview and the 300 DPI file attached to the order.
 */

export type DesignKind = 'visiting-card' | 'keychain' | 'name-slip' | 'frame';

export const DESIGN_FOR_SLUG: Record<string, DesignKind> = {
  'visiting-card': 'visiting-card',
  'photo-keychain': 'keychain',
  'logo-keychain': 'keychain',
  'name-slip-with-photo': 'name-slip',
  'photo-frame': 'frame',
};

export const THEME_COLORS = ['#1D6CF0', '#D9138A', '#0B5D3B', '#131A2B', '#E85D04', '#7B2CBF'];

export type Values = Record<string, string>;

export interface Images {
  photo?: CanvasImageSource & { width: number; height: number };
  logo?: CanvasImageSource & { width: number; height: number };
}

export interface FieldSpec {
  key: string;
  max: number;
  inputMode?: 'tel' | 'email' | 'url';
}

export interface DesignSpec {
  kind: DesignKind;
  fields: FieldSpec[];
  /** Which free text field is the main name (used in the order note). */
  primary: string;
  photo: 'required' | 'none';
  logo: boolean;
  colors: boolean;
  layouts?: string[];
  shapes?: string[];
  orientation?: boolean;
  defaults: Values;
  /** Finished size in mm. */
  size: (v: Values, options: Record<string, string>) => { w: number; h: number };
  /** Photo window in mm, so the photo can be cropped to exactly that shape. */
  photoBox?: (v: Values, options: Record<string, string>) => { w: number; h: number };
  /** DPI for the attached preview file. */
  dpi: number;
  draw: (d: Draw, v: Values, img: Images, options: Record<string, string>) => void;
}

const FONT = `'Plus Jakarta Sans Variable', 'Noto Sans Devanagari Variable', ui-sans-serif, system-ui, sans-serif`;
export const FONTS_TO_LOAD = [`700 16px ${FONT}`, `500 16px ${FONT}`, `400 16px ${FONT}`];

/** Canvas helper working in millimetres. */
export class Draw {
  constructor(
    public ctx: CanvasRenderingContext2D,
    public pxPerMm: number,
  ) {}

  private p = (mm: number) => mm * this.pxPerMm;

  rect(x: number, y: number, w: number, h: number, fill: string, radius = 0) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(this.p(x), this.p(y), this.p(w), this.p(h), this.p(radius));
    ctx.fillStyle = fill;
    ctx.fill();
  }

  stroke(x: number, y: number, w: number, h: number, color: string, width: number, radius = 0) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(this.p(x), this.p(y), this.p(w), this.p(h), this.p(radius));
    ctx.strokeStyle = color;
    ctx.lineWidth = this.p(width);
    ctx.stroke();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(this.p(x1), this.p(y1));
    ctx.lineTo(this.p(x2), this.p(y2));
    ctx.strokeStyle = color;
    ctx.lineWidth = this.p(width);
    ctx.stroke();
  }

  /**
   * Single line of text, shrunk to fit maxW. `size` is the cap height-ish size in mm.
   * Returns the width used.
   */
  text(
    value: string,
    x: number,
    y: number,
    opts: { size: number; weight?: 400 | 500 | 700; color: string; align?: CanvasTextAlign; maxW?: number; baseline?: CanvasTextBaseline },
  ) {
    const { ctx } = this;
    let size = opts.size;
    const setFont = () => (ctx.font = `${opts.weight ?? 400} ${this.p(size)}px ${FONT}`);
    setFont();
    if (opts.maxW) {
      while (size > opts.size * 0.55 && ctx.measureText(value).width > this.p(opts.maxW)) {
        size *= 0.94;
        setFont();
      }
    }
    ctx.fillStyle = opts.color;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = opts.baseline ?? 'alphabetic';
    ctx.fillText(value, this.p(x), this.p(y), opts.maxW ? this.p(opts.maxW) : undefined);
    return ctx.measureText(value).width / this.pxPerMm;
  }

  /** Draws an image to cover (crop) or fit inside a box. */
  image(img: Images['photo'], x: number, y: number, w: number, h: number, mode: 'cover' | 'contain', radius = 0) {
    if (!img) return;
    const { ctx } = this;
    const scale = mode === 'cover' ? Math.max(this.p(w) / img.width, this.p(h) / img.height) : Math.min(this.p(w) / img.width, this.p(h) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(this.p(x), this.p(y), this.p(w), this.p(h), this.p(radius));
    ctx.clip();
    ctx.drawImage(img, this.p(x) + (this.p(w) - dw) / 2, this.p(y) + (this.p(h) - dh) / 2, dw, dh);
    ctx.restore();
  }

  placeholder(x: number, y: number, w: number, h: number, radius = 0) {
    this.rect(x, y, w, h, '#E8ECF2', radius);
    const { ctx } = this;
    // Simple person silhouette.
    ctx.fillStyle = '#C3CAD5';
    ctx.beginPath();
    ctx.arc(this.p(x + w / 2), this.p(y + h * 0.4), this.p(Math.min(w, h) * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(this.p(x + w / 2), this.p(y + h * 0.95), this.p(w * 0.32), this.p(h * 0.3), 0, Math.PI, 0);
    ctx.fill();
  }
}

const MUTED = '#6B7280';
const INK = '#131A2B';
const shown = (v: string | undefined, placeholder: string) => (v?.trim() ? v.trim() : placeholder);

// ── Visiting card ───────────────────────────────────────────────────────────
const visitingCard: DesignSpec = {
  kind: 'visiting-card',
  fields: [
    { key: 'name', max: 40 },
    { key: 'title', max: 40 },
    { key: 'company', max: 50 },
    { key: 'phone', max: 30, inputMode: 'tel' },
    { key: 'email', max: 60, inputMode: 'email' },
    { key: 'website', max: 60, inputMode: 'url' },
    { key: 'address', max: 120 },
  ],
  primary: 'name',
  photo: 'none',
  logo: true,
  colors: true,
  layouts: ['classic', 'modern', 'centered'],
  defaults: { layout: 'classic', color: THEME_COLORS[0]! },
  size: () => ({ w: 90, h: 55 }),
  dpi: 300,
  draw(d, v, img) {
    const color = v.color || THEME_COLORS[0]!;
    const name = shown(v.name, 'Your Name');
    const title = shown(v.title, 'Designation');
    const company = shown(v.company, 'Business Name');
    const contacts = [v.phone && `Ph: ${v.phone}`, v.email, v.website, v.address].filter(Boolean) as string[];
    const contactLines = contacts.length ? contacts : ['Ph: 98765 43210', 'you@example.com', 'Your shop address'];

    if (v.layout === 'modern') {
      d.rect(0, 0, 90, 55, color);
      d.rect(0, 0, 34, 55, 'rgba(255,255,255,0.08)');
      if (img.logo) {
        d.rect(6, 6, 22, 22, '#fff', 3);
        d.image(img.logo, 7.5, 7.5, 19, 19, 'contain');
      } else {
        const initials = company.split(/\s+/).filter(Boolean).map((word) => [...word][0]).join('').slice(0, 2).toUpperCase();
        d.text(initials, 17, 21, { size: 9, weight: 700, color: '#fff', align: 'center' });
      }
      d.text(company, 17, 38, { size: 2.6, weight: 700, color: '#fff', align: 'center', maxW: 28 });
      d.text(name, 40, 17, { size: 5, weight: 700, color: '#fff', maxW: 46 });
      d.text(title, 40, 23, { size: 2.6, weight: 500, color: 'rgba(255,255,255,0.8)', maxW: 46 });
      d.line(40, 27, 52, 27, '#FFC20E', 0.6);
      contactLines.slice(0, 4).forEach((c, i) => d.text(c, 40, 34 + i * 4.6, { size: 2.3, color: '#fff', maxW: 46 }));
      return;
    }

    if (v.layout === 'centered') {
      d.rect(0, 0, 90, 55, '#fff');
      d.rect(0, 51, 90, 4, color);
      if (img.logo) d.image(img.logo, 37, 4, 16, 12, 'contain');
      else d.text(company, 45, 12, { size: 3.6, weight: 700, color, align: 'center', maxW: 70 });
      d.text(name, 45, 24, { size: 4.6, weight: 700, color: INK, align: 'center', maxW: 76 });
      d.text(title, 45, 29.5, { size: 2.5, weight: 500, color: MUTED, align: 'center', maxW: 76 });
      d.line(35, 33, 55, 33, color, 0.4);
      const [first, ...rest] = contactLines;
      d.text([first, rest[0]].filter(Boolean).join('   |   '), 45, 39, { size: 2.3, color: INK, align: 'center', maxW: 80 });
      if (rest.length > 1) d.text(rest.slice(1).join('   |   '), 45, 44, { size: 2.2, color: MUTED, align: 'center', maxW: 80 });
      return;
    }

    // classic
    d.rect(0, 0, 90, 55, '#fff');
    d.rect(0, 0, 5, 55, color);
    if (img.logo) d.image(img.logo, 10, 6, 16, 12, 'contain');
    d.text(company, img.logo ? 29 : 10, 13.5, { size: 3.4, weight: 700, color, maxW: img.logo ? 55 : 74 });
    d.text(name, 10, 27, { size: 4.6, weight: 700, color: INK, maxW: 74 });
    d.text(title, 10, 32, { size: 2.5, weight: 500, color: MUTED, maxW: 74 });
    d.line(10, 35.5, 30, 35.5, color, 0.5);
    contactLines.slice(0, 4).forEach((c, i) => d.text(c, 10, 41 + i * 3.6, { size: 2.2, color: INK, maxW: 74 }));
  },
};

// ── Key chain ───────────────────────────────────────────────────────────────
function keychainSize(v: Values, options: Record<string, string>) {
  const k = options.size === 'large' ? 1.3 : 1;
  if (v.shape === 'round') return { w: 45 * k, h: 45 * k };
  if (v.shape === 'heart') return { w: 50 * k, h: 46 * k };
  return { w: 40 * k, h: 55 * k };
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h * 0.28);
  ctx.bezierCurveTo(x + w / 2, y + h * 0.05, x + w * 0.02, y, x + w * 0.02, y + h * 0.33);
  ctx.bezierCurveTo(x + w * 0.02, y + h * 0.62, x + w * 0.35, y + h * 0.78, x + w / 2, y + h);
  ctx.bezierCurveTo(x + w * 0.65, y + h * 0.78, x + w * 0.98, y + h * 0.62, x + w * 0.98, y + h * 0.33);
  ctx.bezierCurveTo(x + w * 0.98, y, x + w / 2, y + h * 0.05, x + w / 2, y + h * 0.28);
  ctx.closePath();
}

const keychain: DesignSpec = {
  kind: 'keychain',
  fields: [
    { key: 'text', max: 24 },
    { key: 'subtext', max: 30 },
  ],
  primary: 'text',
  photo: 'required',
  logo: false,
  colors: true,
  shapes: ['rectangle', 'round', 'heart'],
  defaults: { shape: 'rectangle', color: THEME_COLORS[1]! },
  size: keychainSize,
  photoBox: (v, o) => {
    const s = keychainSize(v, o);
    return { w: s.w, h: s.h * 0.74 };
  },
  dpi: 300,
  draw(d, v, img, options) {
    const { w, h } = keychainSize(v, options);
    const { ctx, pxPerMm: k } = d;
    const color = v.color || THEME_COLORS[1]!;
    ctx.save();
    // Shape clip
    ctx.beginPath();
    if (v.shape === 'round') ctx.arc((w / 2) * k, (h / 2) * k, (w / 2) * k, 0, Math.PI * 2);
    else if (v.shape === 'heart') heartPath(ctx, 0, 0, w * k, h * k);
    else ctx.roundRect(0, 0, w * k, h * k, 5 * k);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    const band = h * 0.26;
    if (img.photo) d.image(img.photo, 0, 0, w, h - band, 'cover');
    else d.placeholder(0, 0, w, h - band);
    d.rect(0, h - band, w, band, color);
    const hasSub = Boolean(v.subtext?.trim());
    const textY = v.shape === 'heart' ? h - band * 0.62 : h - band * (hasSub ? 0.55 : 0.38);
    d.text(shown(v.text, 'Name'), w / 2, textY, { size: band * 0.34, weight: 700, color: '#fff', align: 'center', maxW: w * (v.shape === 'rectangle' ? 0.86 : 0.6) });
    if (hasSub && v.shape !== 'heart') {
      d.text(v.subtext!.trim(), w / 2, h - band * 0.18, { size: band * 0.2, weight: 500, color: 'rgba(255,255,255,0.85)', align: 'center', maxW: w * (v.shape === 'round' ? 0.5 : 0.8) });
    }
    // Acrylic gloss
    const gloss = ctx.createLinearGradient(0, 0, w * k, h * k);
    gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, w * k, h * k);
    ctx.restore();
    // Ring hole: top centre, or the top of the left lobe on a heart (the centre is a dip).
    const [holeX, holeY] = v.shape === 'heart' ? [w * 0.27, h * 0.1] : [w / 2, 3.2];
    ctx.beginPath();
    ctx.arc(holeX * k, holeY * k, 1.6 * k, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.lineWidth = 0.5 * k;
    ctx.strokeStyle = '#9aa3af';
    ctx.stroke();
  },
};

// ── Name slip ───────────────────────────────────────────────────────────────
const nameSlip: DesignSpec = {
  kind: 'name-slip',
  fields: [
    { key: 'name', max: 32 },
    { key: 'class', max: 12 },
    { key: 'section', max: 6 },
    { key: 'rollNo', max: 10 },
    { key: 'subject', max: 24 },
    { key: 'school', max: 60 },
  ],
  primary: 'name',
  photo: 'required',
  logo: false,
  colors: true,
  defaults: { color: THEME_COLORS[0]! },
  size: () => ({ w: 90, h: 45 }),
  photoBox: () => ({ w: 26, h: 32 }),
  dpi: 300,
  draw(d, v, img) {
    const color = v.color || THEME_COLORS[0]!;
    d.rect(0, 0, 90, 45, '#fff', 3);
    d.stroke(1, 1, 88, 43, color, 1.2, 2.5);
    d.rect(1.6, 36, 86.8, 7.4, color, 0);
    // Photo
    d.rect(4, 3.4, 28, 34, color, 2);
    if (img.photo) d.image(img.photo, 5, 4.4, 26, 32, 'cover', 1.5);
    else d.placeholder(5, 4.4, 26, 32, 1.5);
    // Details
    d.text('NAME', 36, 8.5, { size: 2, weight: 700, color: MUTED });
    d.text(shown(v.name, 'Student Name'), 36, 15, { size: 5, weight: 700, color: INK, maxW: 50 });
    const rows: [string, string][] = [
      ['Class', [v.class, v.section].filter((x) => x?.trim()).join(' - ') || '—'],
      ['Roll No.', v.rollNo?.trim() || '—'],
      ['Subject', v.subject?.trim() || '—'],
    ];
    rows.forEach(([label, value], i) => {
      const y = 21.5 + i * 4.6;
      d.text(label, 36, y, { size: 2.3, weight: 700, color: MUTED });
      d.text(value, 52, y, { size: 2.9, weight: 500, color: INK, maxW: 34 });
      d.line(52, y + 1, 86, y + 1, '#D7DCE3', 0.2);
    });
    d.text(shown(v.school, 'School Name'), 45, 41, { size: 2.8, weight: 700, color: '#fff', align: 'center', maxW: 80 });
  },
};

// ── Photo frame ─────────────────────────────────────────────────────────────
const FRAME_SIZES: Record<string, { w: number; h: number }> = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  '12x18': { w: 305, h: 457 },
};

function frameSize(v: Values, options: Record<string, string>) {
  const s = FRAME_SIZES[options.size ?? 'A5'] ?? FRAME_SIZES.A5!;
  return v.orientation === 'landscape' ? { w: s.h, h: s.w } : s;
}

function frameBorder(options: Record<string, string>, size: { w: number; h: number }) {
  const short = Math.min(size.w, size.h);
  return options.frameType === 'acrylic' ? short * 0.02 : options.frameType === 'led' ? short * 0.045 : short * 0.07;
}

const frame: DesignSpec = {
  kind: 'frame',
  fields: [
    { key: 'caption', max: 40 },
    { key: 'subcaption', max: 50 },
  ],
  primary: 'caption',
  photo: 'required',
  logo: false,
  colors: false,
  orientation: true,
  defaults: { orientation: 'portrait' },
  size: frameSize,
  photoBox: (v, o) => {
    const s = frameSize(v, o);
    const b = frameBorder(o, s);
    return { w: s.w - 2 * b, h: s.h - 2 * b };
  },
  // Large frames: the photo itself is uploaded at full quality; the preview only needs to show the look.
  dpi: 100,
  draw(d, v, img, options) {
    const s = frameSize(v, options);
    const b = frameBorder(options, s);
    const { ctx, pxPerMm: k } = d;
    if (options.frameType === 'acrylic') {
      d.rect(0, 0, s.w, s.h, '#EEF3F8', 2);
    } else if (options.frameType === 'led') {
      d.rect(0, 0, s.w, s.h, '#111827', 3);
    } else {
      const wood = ctx.createLinearGradient(0, 0, s.w * k, s.h * k);
      wood.addColorStop(0, '#7A4E2D');
      wood.addColorStop(0.5, '#5B3A21');
      wood.addColorStop(1, '#3E2715');
      ctx.fillStyle = wood;
      ctx.fillRect(0, 0, s.w * k, s.h * k);
      d.stroke(b * 0.82, b * 0.82, s.w - b * 1.64, s.h - b * 1.64, '#C9A36B', b * 0.08);
    }
    const iw = s.w - 2 * b;
    const ih = s.h - 2 * b;
    if (options.frameType === 'led') {
      ctx.save();
      ctx.shadowColor = '#7DD3FC';
      ctx.shadowBlur = b * 0.9 * k;
      d.rect(b, b, iw, ih, '#7DD3FC');
      ctx.restore();
    }
    if (img.photo) d.image(img.photo, b, b, iw, ih, 'cover');
    else d.placeholder(b, b, iw, ih);

    if (v.caption?.trim() || v.subcaption?.trim()) {
      const grad = ctx.createLinearGradient(0, (b + ih * 0.7) * k, 0, (b + ih) * k);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(b * k, (b + ih * 0.7) * k, iw * k, ih * 0.3 * k);
      const unit = Math.min(iw, ih);
      if (v.caption?.trim()) d.text(v.caption.trim(), s.w / 2, b + ih - unit * (v.subcaption?.trim() ? 0.12 : 0.07), { size: unit * 0.07, weight: 700, color: '#fff', align: 'center', maxW: iw * 0.9 });
      if (v.subcaption?.trim()) d.text(v.subcaption.trim(), s.w / 2, b + ih - unit * 0.05, { size: unit * 0.04, weight: 500, color: 'rgba(255,255,255,0.9)', align: 'center', maxW: iw * 0.9 });
    }
    if (options.frameType === 'acrylic') {
      const gloss = ctx.createLinearGradient(0, 0, s.w * k, s.h * 0.6 * k);
      gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
      gloss.addColorStop(0.4, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, s.w * k, s.h * k);
    }
  },
};

export const DESIGNS: Record<DesignKind, DesignSpec> = {
  'visiting-card': visitingCard,
  keychain,
  'name-slip': nameSlip,
  frame,
};

/** Paints a design onto a canvas at the given pixels per millimetre. */
export function paint(canvas: HTMLCanvasElement, spec: DesignSpec, values: Values, images: Images, options: Record<string, string>, pxPerMm: number) {
  const { w, h } = spec.size(values, options);
  canvas.width = Math.round(w * pxPerMm);
  canvas.height = Math.round(h * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  spec.draw(new Draw(ctx, pxPerMm), values, images, options);
}

/** English summary for the order note, so staff see the typed text exactly. */
export function summarise(spec: DesignSpec, values: Values, options: Record<string, string>) {
  const LABELS: Record<string, string> = {
    name: 'Name', title: 'Designation', company: 'Business', phone: 'Phone', email: 'Email', website: 'Website', address: 'Address',
    text: 'Text', subtext: 'Line 2', class: 'Class', section: 'Section', rollNo: 'Roll no.', subject: 'Subject', school: 'School',
    caption: 'Caption', subcaption: 'Line 2', layout: 'Layout', shape: 'Shape', orientation: 'Orientation', color: 'Colour',
  };
  const parts = [
    ...spec.fields.map((f) => [f.key, values[f.key]?.trim()] as const),
    ...(['layout', 'shape', 'orientation', 'color'] as const).map((k) => [k, values[k]] as const),
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${LABELS[k] ?? k}: ${v}`);
  const { w, h } = spec.size(values, options);
  return `[Design] ${parts.join(' | ')} | Size: ${Math.round(w)}x${Math.round(h)} mm`;
}
