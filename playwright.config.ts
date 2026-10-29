import { defineConfig } from '@playwright/test';

/**
 * Responsive checks against the running dev servers (npm run dev:website / dev:admin / dev:backend).
 * Every page is opened at each test width; a page wider than the screen fails, and a screenshot
 * of every page and width is kept in test-results/ for review.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: 4,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    headless: true,
    // The website and admin dev servers; override for a deployed build.
    baseURL: process.env.E2E_WEBSITE_URL ?? 'http://localhost:5173',
  },
});
