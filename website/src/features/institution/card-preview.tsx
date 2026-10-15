import { IconUser } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { CardKind, CardKindInfo } from './api';

/** Dummy people so the preview shows realistic text lengths. */
const SAMPLE: Record<CardKind, Record<string, string>> = {
  student_id: { name: 'Aarav Sharma', rollNo: '1023', admissionNo: 'A-3381', class: 'VII - B', fatherName: 'Rajesh Sharma', motherName: 'Sunita Sharma', dob: '14-03-2013', bloodGroup: 'B+', phone: '9876543210', address: '12, Civil Lines', session: '2026-27', route: 'Route 4' },
  teacher_id: { name: 'Meena Gupta', employeeId: 'T-017', designation: 'PGT Mathematics', department: 'Science', dob: '02-07-1986', bloodGroup: 'A+', phone: '9898989898', address: '7, Teachers Colony', session: '2026-27' },
  out_pass: { name: 'Kabir Khan', rollNo: '2045', admissionNo: 'A-1190', class: 'X - A', fatherName: 'Imran Khan', phone: '9765432101', address: 'Sipri Bazar', route: 'Route 4', session: '2026-27' },
  fee_card: { name: 'Diya Patel', admissionNo: 'A-3381', rollNo: '18', class: 'IV - C', fatherName: 'Nilesh Patel', phone: '9123456780', address: 'Sadar Bazar', session: '2026-27' },
};

export interface PreviewTemplate {
  kind: CardKind;
  orientation: 'landscape' | 'portrait';
  colors: { primary: string; accent: string; text: string };
  headerText: string;
  subText: string;
  fields: string[];
  backText: string;
  signatureLabel: string;
  validUpto: string;
  logoUrl?: string;
}

const PT_TO_MM = 25.4 / 72;

/**
 * CSS approximation of the generated print sheet. Lengths mirror the PDF renderer: boxes in mm,
 * text in points, both scaled to the card width with container query units. The server PDF is
 * the source of truth.
 */
export function CardPreview({ template, info, side, className }: { template: PreviewTemplate; info: CardKindInfo; side: 'front' | 'back'; className?: string }) {
  const portrait = template.orientation === 'portrait';
  const w = portrait ? info.size.h : info.size.w;
  const h = portrait ? info.size.w : info.size.h;
  // The renderer's design unit: 1 at the standard 54 mm card side.
  const u = (portrait ? w : h) / 54;
  const mm = (v: number) => `${((v * u) / w) * 100}cqw`;
  const pt = (v: number) => mm(v * PT_TO_MM);
  const data = SAMPLE[template.kind];
  const labels = Object.fromEntries(info.allowedFields.map((f) => [f.key, f.label]));
  const fields = template.fields
    .filter((f) => f !== 'section')
    .map((f) => ({ label: labels[f] ?? f, value: data[f] }))
    .filter((f) => f.value)
    .slice(0, 5);
  const style = { aspectRatio: `${w} / ${h}`, containerType: 'inline-size', color: template.colors.text, lineHeight: 1.15 } as CSSProperties;
  const showPhoto = info.photoRequired;

  if (side === 'back') {
    return (
      <div className={cn('relative overflow-hidden rounded-[3.5cqw] bg-white shadow-lg ring-1 ring-black/10', className)} style={style}>
        <div className="absolute inset-x-0 top-0" style={{ height: mm(4), background: template.colors.primary }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: mm(2.5), background: template.colors.primary }} />
        <div className="flex h-full flex-col items-center text-center" style={{ padding: `${mm(6.5)} ${mm(4)} ${mm(4)}`, gap: mm(1.2) }}>
          {template.kind === 'fee_card' || template.kind === 'out_pass' ? (
            <>
              <p className="self-start font-bold" style={{ fontSize: pt(template.kind === 'fee_card' ? 8 : 6.5), color: template.colors.primary }}>
                {template.kind === 'fee_card' ? 'FEE RECORD' : 'OUT PASS RECORD'}
              </p>
              <div
                className="w-full flex-1"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${mm(5)}, #d6dbe2 ${mm(5)} ${mm(5.2)})`,
                  borderTop: `1px solid ${template.colors.primary}`,
                }}
              />
            </>
          ) : (
            <>
              <p className="font-bold text-gray-500" style={{ fontSize: pt(5.2) }}>IF FOUND, PLEASE RETURN TO</p>
              <p className="w-full truncate font-bold" style={{ fontSize: pt(7.6), color: template.colors.primary }}>{template.headerText || 'Institution name'}</p>
              {template.subText && <p className="line-clamp-2" style={{ fontSize: pt(5.4) }}>{template.subText}</p>}
              <div className="h-px w-full bg-gray-200" style={{ margin: `${mm(1)} 0` }} />
              <p className="w-full text-left" style={{ fontSize: pt(5.4) }}>
                <b className="text-gray-500">Emergency</b>&nbsp;&nbsp;{data.phone}
              </p>
              {template.backText && <p className="line-clamp-3 text-gray-500" style={{ fontSize: pt(4.8) }}>{template.backText}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-[3.5cqw] bg-white shadow-lg ring-1 ring-black/10', className)} style={style}>
      <div
        className={cn('flex', portrait ? 'flex-col items-center justify-center text-center' : 'items-center')}
        style={{
          background: template.colors.primary,
          height: mm(portrait ? 20.5 : 13),
          padding: `0 ${mm(3)}`,
          gap: mm(portrait ? 1.2 : 2.5),
          borderBottom: `${mm(1.2)} solid ${template.colors.accent}`,
        }}
      >
        <span className="grid shrink-0 place-items-center bg-white" style={{ width: mm(portrait ? 9 : 10), height: mm(portrait ? 9 : 10) }}>
          {template.logoUrl ? (
            <img src={template.logoUrl} alt="" className="size-[88%] object-contain" />
          ) : (
            <span className="font-bold" style={{ fontSize: pt(4.5), color: template.colors.primary }}>LOGO</span>
          )}
        </span>
        <span className={cn('min-w-0', portrait && 'w-full')}>
          <span className="block truncate font-bold text-white" style={{ fontSize: pt(portrait ? 8 : 9) }}>{template.headerText || 'Institution name'}</span>
          {template.subText && <span className="block truncate text-white/90" style={{ fontSize: pt(portrait ? 4.8 : 5.2) }}>{template.subText}</span>}
        </span>
      </div>

      <div className={cn('flex', portrait ? 'flex-col items-center' : 'items-start')} style={{ padding: `${mm(portrait ? 3 : 2.5)} ${mm(3)} 0`, gap: mm(portrait ? 1.5 : 3) }}>
        {showPhoto && (
          <span
            className="grid shrink-0 place-items-center bg-slate-100 text-slate-300"
            style={{ width: mm(portrait ? 22 : 20), height: mm(portrait ? 27.5 : 25), border: `1px solid ${template.colors.primary}` }}
          >
            <IconUser style={{ width: '60%', height: '60%' }} />
          </span>
        )}
        <div className={cn('min-w-0 flex-1', portrait && 'w-full')}>
          <p className={cn('truncate font-bold', portrait && 'text-center')} style={{ fontSize: pt(9), color: template.colors.primary }}>{data.name}</p>
          <dl className="grid items-baseline" style={{ gridTemplateColumns: `${mm(16)} 1fr`, rowGap: mm(0.8), marginTop: mm(1.2), paddingLeft: portrait ? mm(1) : 0 }}>
            {fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="truncate font-bold text-gray-500" style={{ fontSize: pt(5.2) }}>{f.label}</dt>
                <dd className="truncate" style={{ fontSize: pt(6.2) }}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {template.signatureLabel && (
        <span className="absolute text-center text-gray-500" style={{ right: mm(3), bottom: mm(5.6), width: mm(16), fontSize: pt(4.6), borderTop: '1px solid #9ca3af' }}>
          {template.signatureLabel}
        </span>
      )}
      <div
        className={cn('absolute inset-x-0 bottom-0 flex items-center text-white', portrait ? 'justify-center' : 'justify-between')}
        style={{ height: mm(5), background: template.colors.primary, padding: `0 ${mm(3)}`, fontSize: pt(5.4) }}
      >
        <b>{info.badge}</b>
        {template.validUpto && (
          <span>
            {portrait ? ' | ' : ''}Valid upto {template.validUpto}
          </span>
        )}
      </div>
    </div>
  );
}
