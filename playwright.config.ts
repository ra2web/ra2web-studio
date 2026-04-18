import { defineConfig } from '@playwright/test'

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '3000', 10)
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  // E2E fixtures seed the same OPFS origin storage, so multiple workers would
  // race on the shared workspace and make tests flaky.
  workers: 1,
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
    viewport: {
      width: 1440,
      height: 960,
    },
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
