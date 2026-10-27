import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { DynamicIcon, ICON_NAMES } from '@/components/common/dynamic-icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Readable names for the icon keys, e.g. "id-badge-2" → "ID badge". */
const LABELS: Record<string, string> = {
  'address-book': 'Address book',
  award: 'Award',
  book: 'Book',
  briefcase: 'Business',
  cards: 'Cards',
  'file-certificate': 'Certificate',
  'file-text': 'Document',
  frame: 'Frame',
  gift: 'Gift',
  heart: 'Heart',
  id: 'ID card',
  'id-badge-2': 'ID badge',
  key: 'Key chain',
  medal: 'Medal',
  news: 'Newspaper',
  notebook: 'Notebook',
  palette: 'Design',
  photo: 'Photo',
  presentation: 'Presentation',
  printer: 'Printing',
  receipt: 'Receipt',
  school: 'School',
  shirt: 'T-shirt',
  sticker: 'Sticker',
  'user-square': 'Portrait',
};

export const iconLabel = (name: string) => LABELS[name] ?? name.replace(/-/g, ' ');

/** Searchable icon grid with a visible name under every icon. */
export function IconPicker({ value, onChange, id }: { value: string; onChange: (name: string) => void; id?: string }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const names = q ? ICON_NAMES.filter((n) => n.includes(q) || iconLabel(n).toLowerCase().includes(q)) : ICON_NAMES;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons" className="pl-8" />
        </div>
        <span className="flex shrink-0 items-center gap-2 rounded-lg shadow-card px-2.5 py-1.5 text-sm">
          <DynamicIcon name={value} className="size-4 text-primary" />
          <span className="font-medium">{iconLabel(value)}</span>
        </span>
      </div>
      <div role="radiogroup" aria-label="Icon" className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
        {names.map((name) => {
          const selected = value === name;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              title={iconLabel(name)}
              onClick={() => onChange(name)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg shadow-card px-1 py-2 text-[11px] leading-tight transition-colors',
                selected ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <DynamicIcon name={name} className="size-5" />
              <span className="w-full truncate text-center">{iconLabel(name)}</span>
            </button>
          );
        })}
        {names.length === 0 && <p className="col-span-full py-4 text-center text-sm text-muted-foreground">No icon matches “{query}”</p>}
      </div>
    </div>
  );
}
