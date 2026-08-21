import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: [
    {
      command: 'node scripts/auth-e2e-upstream.mjs',
      url: 'http://127.0.0.1:4174/_test/stats',
      reuseExistingServer: false,
    },
    {
      command:
        'npm run build:qa && npx wrangler dev --env qa --local --ip 127.0.0.1 --port 4173 --var IDENTITY_ORIGIN:http://127.0.0.1:4174',
      port: 4173,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
    { name: 'ios', use: { ...devices['iPhone 13'] } },
  ],
})
