import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npx wrangler dev --env qa --local --ip 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
    { name: 'ios', use: { ...devices['iPhone 13'] } },
  ],
})
