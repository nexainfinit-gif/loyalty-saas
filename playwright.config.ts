import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke tests.
 *
 * Par défaut : lance le dev server local et teste http://localhost:3000.
 * Pour cibler un autre environnement (staging, prod en lecture seule) :
 *   PLAYWRIGHT_BASE_URL=https://app.rebites.be npx playwright test
 *
 * ⚠️ Les specs doivent rester READ-ONLY (navigation/rendu uniquement) :
 * le dev server local pointe la même base Supabase que la prod.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const isExternal = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL,
    actionTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
  },

  timeout: 60_000,

  // Démarre automatiquement le dev server quand on teste en local.
  webServer: isExternal
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000/fr/dashboard/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },

  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // Pixel 5 = moteur Chromium (pas de dépendance WebKit à installer)
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
