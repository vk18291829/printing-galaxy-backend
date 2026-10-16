import type { ComponentProps } from 'react';
import { Link } from 'react-router';

/**
 * Link for content edited in the admin panel: site paths use the router, full URLs open in a
 * new tab. Without an href it renders the children in a plain wrapper so nothing is clickable.
 */
export function SmartLink({ href, children, ...props }: Omit<ComponentProps<'a'>, 'href'> & { href?: string }) {
  if (!href) return <div className={props.className}>{children}</div>;
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} {...props}>
      {children}
    </Link>
  );
}
