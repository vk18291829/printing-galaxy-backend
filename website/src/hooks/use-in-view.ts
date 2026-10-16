import { useEffect, useRef } from 'react';

/**
 * Calls `onEnter` whenever the returned element scrolls within `rootMargin` of the viewport.
 * Used as the sentinel at the end of infinitely scrolling lists; change `resetKey` after each
 * load so a sentinel that is still on screen triggers again.
 */
export function useInView<T extends Element>(
  onEnter: () => void,
  { enabled = true, rootMargin = '600px', resetKey = 0 }: { enabled?: boolean; rootMargin?: string; resetKey?: unknown } = {},
) {
  const ref = useRef<T>(null);
  const callback = useRef(onEnter);
  callback.current = onEnter;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && callback.current(), { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
    // resetKey re-observes after each page so a sentinel that stays on screen fires again.
  }, [enabled, rootMargin, resetKey]);

  return ref;
}
