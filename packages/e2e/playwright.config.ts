import { defineConfig, devices } from '@playwright/test'

import { BASE_URL, LOGIN_STATE } from './tests/fixtures/env'
import { TIMEOUTS } from './tests/fixtures/timeouts'

/**
 * ルートの compose で立てた全体に向けて流す。先に `docker compose up --build --wait` で起動しておく。
 * spec は職員ごとのログインの状態のファイルを共有するので、worker は 1 つにする（kit の ensureSavedLogin の文書コメント）。
 */
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: TIMEOUTS.test,
  expect: { timeout: TIMEOUTS.expect },
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    actionTimeout: TIMEOUTS.action,
    navigationTimeout: TIMEOUTS.navigation,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/ },
    {
      name: 'e2e',
      testMatch: /specs\/.*\.e2e\.ts/,
      dependencies: ['setup'],
      use: { storageState: LOGIN_STATE },
    },
  ],
})
