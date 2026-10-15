import type { LocalizedString } from '@/types/api';

/** Admin UI is English; catalogue values show their English text with Hindi as fallback. */
export const en = (value?: LocalizedString | null) => value?.en || value?.hi || '';

export const UNIT_LABEL: Record<string, [string, string]> = {
  page: ['page', 'pages'],
  piece: ['piece', 'pieces'],
  card: ['card', 'cards'],
  copy: ['copy', 'copies'],
  set: ['set', 'sets'],
  photo: ['photo', 'photos'],
};

export function unitLabel(unit: string, count: number) {
  const [one, many] = UNIT_LABEL[unit] ?? [unit, `${unit}s`];
  return count === 1 ? one : many;
}
