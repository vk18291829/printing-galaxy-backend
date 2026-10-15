import {
  IconAddressBook,
  IconAward,
  IconBook2,
  IconBriefcase,
  IconCards,
  IconFileCertificate,
  IconFileText,
  IconFrame,
  IconGift,
  IconHeart,
  IconId,
  IconIdBadge2,
  IconKey,
  IconMedal,
  IconNews,
  IconNotebook,
  IconPalette,
  IconPhoto,
  IconPresentation,
  IconPrinter,
  IconReceipt,
  IconSchool,
  IconShirt,
  IconSticker,
  IconUserSquare,
  type IconProps,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';

/** Catalogue items store a Tabler icon name; this maps it to a component. */
const ICONS: Record<string, ComponentType<IconProps>> = {
  'address-book': IconAddressBook,
  award: IconAward,
  book: IconBook2,
  briefcase: IconBriefcase,
  cards: IconCards,
  'file-certificate': IconFileCertificate,
  'file-text': IconFileText,
  frame: IconFrame,
  gift: IconGift,
  heart: IconHeart,
  id: IconId,
  'id-badge-2': IconIdBadge2,
  key: IconKey,
  medal: IconMedal,
  news: IconNews,
  notebook: IconNotebook,
  palette: IconPalette,
  photo: IconPhoto,
  presentation: IconPresentation,
  printer: IconPrinter,
  receipt: IconReceipt,
  school: IconSchool,
  shirt: IconShirt,
  sticker: IconSticker,
  'user-square': IconUserSquare,
};

export const ICON_NAMES = Object.keys(ICONS);

export function DynamicIcon({ name, ...props }: IconProps & { name?: string }) {
  const Icon = (name && ICONS[name]) || IconPrinter;
  return <Icon {...props} />;
}
