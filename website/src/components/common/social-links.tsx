import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandYoutube,
  type Icon,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import type { PublicSettings, SocialNetwork } from '@/types/api';

const NETWORKS: { key: SocialNetwork; label: string; icon: Icon }[] = [
  { key: 'instagram', label: 'Instagram', icon: IconBrandInstagram },
  { key: 'facebook', label: 'Facebook', icon: IconBrandFacebook },
  { key: 'youtube', label: 'YouTube', icon: IconBrandYoutube },
  { key: 'x', label: 'X', icon: IconBrandX },
  { key: 'linkedin', label: 'LinkedIn', icon: IconBrandLinkedin },
];

/** The networks the owner filled in under Admin → Settings → Social media, in a fixed order. */
export function socialLinks(social?: PublicSettings['social']) {
  return NETWORKS.flatMap((n) => (social?.[n.key] ? [{ ...n, url: social[n.key]! }] : []));
}

/** Round icon buttons, one per configured network; renders nothing when none are set. */
export function SocialLinks({
  social,
  className,
}: {
  social?: PublicSettings['social'];
  className?: string;
}) {
  const links = socialLinks(social);
  if (!links.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {links.map(({ key, label, icon: Icon, url }) => (
        <li key={key}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={label}
            title={label}
            className="bg-background text-muted-foreground hover:border-primary hover:text-primary grid size-9 place-items-center rounded-full border transition-colors"
          >
            <Icon className="size-[18px]" />
          </a>
        </li>
      ))}
    </ul>
  );
}
