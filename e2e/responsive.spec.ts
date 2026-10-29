import { expect, test, type Page } from '@playwright/test';

/** The widths to check: small phones to large monitors (CSS pixels). */
const WIDTHS = [320, 360, 375, 390, 430, 480, 600, 768, 820, 912, 1024, 1180, 1280, 1366, 1440, 1920];
const heightFor = (w: number) => (w < 600 ? 800 : w < 1024 ? 1100 : 900);

const WEBSITE = process.env.E2E_WEBSITE_URL ?? 'http://localhost:5173';
const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:5174';

const WEBSITE_PAGES = [
  ['home', '/'],
  ['products', '/products'],
  ['product', `/products/${process.env.E2E_PRODUCT_SLUG ?? 'wedding-card'}`],
  ['business', '/business-printing'],
  ['wedding', '/wedding-cards'],
  ['institutions', '/institutions'],
  ['contact', '/contact'],
  ['track', '/track'],
  ['login', '/login'],
  ['school-login', '/institutions/login'],
] as const;

/** Admin screens checked when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are set (a staff account). */
const ADMIN_PAGES = [
  ['dashboard', '/'],
  ['orders', '/orders'],
  ['walk-in', '/orders/new'],
  ['products', '/products'],
  ['customers', '/customers'],
  ['institutions', '/institutions'],
  ['stock', '/inventory'],
  ['staff', '/staff'],
  ['audit', '/audit'],
  ['system', '/system'],
  ['reports', '/reports'],
] as const;

/** How far the page is wider than the screen (0 when it fits); names the widest offenders. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 1) return false;
        // Inside a container that scrolls sideways on purpose (tables, chip rows, carousels).
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if ((s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip') && p.getBoundingClientRect().right <= vw + 1) return false;
        }
        return true;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.')}`);
    return { by: Math.max(0, document.documentElement.scrollWidth - vw), wide };
  });
}

/** Header controls (logo, buttons, links) that cover one another, e.g. a pill over the logo. */
async function headerOverlaps(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return [];
    const items = [...header.querySelectorAll<HTMLElement>('a, button')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    });
    // Only items whose own scroll row does not clip them (chip rows scroll sideways on purpose).
    const visible = items.filter((el) => {
      const r = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== header; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible') {
          const b = p.getBoundingClientRect();
          if (r.left < b.left - 1 || r.right > b.right + 1) return false;
        }
      }
      return true;
    });
    const hits: string[] = [];
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = visible[i]!, b = visible[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (x > 2 && y > 2) hits.push(`"${a.textContent?.trim().slice(0, 20)}" × "${b.textContent?.trim().slice(0, 20)}"`);
      }
    }
    return hits;
  });
}

async function check(page: Page, name: string, width: number) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Wait until loading spinners are gone, so the screenshot shows the finished screen.
  // (Spinners are SVG icons, which have no offsetParent, so visibility is judged by their size.)
  await page
    .waitForFunction(() => ![...document.querySelectorAll('.animate-spin')].some((el) => el.getBoundingClientRect().width > 0), null, { timeout: 15_000 })
    .catch(() => undefined);
  // Fonts and lazy images settle the final layout.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath(`${name}-${width}.png`), fullPage: false });
  const result = await overflow(page);
  expect(result.by, `${name} at ${width}px is ${result.by}px wider than the screen: ${result.wide.join(', ')}`).toBe(0);
  expect(await headerOverlaps(page), `${name} at ${width}px: header controls overlap`).toEqual([]);
}

for (const [name, path] of WEBSITE_PAGES) {
  test.describe(`website ${name}`, () => {
    for (const width of WIDTHS) {
      test(`${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: heightFor(width) });
        // Skip the one-time language question, as a returning visitor would.
        await page.addInitScript(() => {
          localStorage.setItem('pg-lang', 'en');
          localStorage.setItem('pg-lang-chosen', '1');
        });
        await page.goto(`${WEBSITE}${path}`);
        await check(page, `website-${name}`, width);
      });
    }
  });
}

test.describe('admin', () => {
  test.describe('login', () => {
    for (const width of WIDTHS) {
      test(`${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: heightFor(width) });
        await page.goto(`${ADMIN}/login`);
        await check(page, 'admin-login', width);
      });
    }
  });

  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  for (const [name, path] of ADMIN_PAGES) {
    test.describe(name, () => {
      test.skip(!email || !password, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to check signed-in admin screens');
      for (const width of WIDTHS) {
        test(`${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: heightFor(width) });
          await page.goto(`${ADMIN}/login`);
          await page.getByLabel(/email/i).fill(email!);
          await page.getByLabel(/password/i).fill(password!);
          await page.getByRole('button', { name: /sign in/i }).click();
          await page.waitForURL((u) => !u.pathname.startsWith('/login'));
          await page.goto(`${ADMIN}${path}`);
          await check(page, `admin-${name}`, width);
        });
      }
    });
  }
});
