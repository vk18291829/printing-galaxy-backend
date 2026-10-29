import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { API_URL } from '@/lib/api-client';

const VISIT_KEY = 'pg-visit';

/** Visitors who asked browsers not to track them are not counted at all. */
function trackingRefused() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** First page of this visit (this browser tab), so where visitors come from is counted once per visit. */
function startsVisit() {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return false;
    sessionStorage.setItem(VISIT_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Counts page views for the shop's own visit numbers (admin dashboard). No cookies and nothing
 * personal: the server keeps daily totals only. Production builds only, so development and tests
 * do not inflate the numbers.
 */
export function usePageViews() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!import.meta.env.PROD || trackingRefused()) return;
    const landing = startsVisit();
    void fetch(`${API_URL}/analytics/pageview`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        width: window.innerWidth,
        landing,
        referrer: landing && document.referrer ? document.referrer : undefined,
      }),
    }).catch(() => undefined);
  }, [pathname]);
}
