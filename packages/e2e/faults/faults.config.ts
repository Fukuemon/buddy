import { defineConfig, devices } from '@playwright/test'

import { resolveLocalhostToLoopback } from '../localhostResolver'
import { BASE_URL, TIMEZONE_ID } from '../tests/fixtures/env'

// 設定は、test の runner と worker のそれぞれで読まれるので、両方のプロセスで差し替わる
resolveLocalhostToLoopback()

/**
 * token_hook とブローカーの故障を入れる測定の config。packages/e2e/faults/run.sh が、compose.faults.yml を重ねた compose に向けて流す。
 * 故障はコンテナと DB の全体に入るので、ほかの spec と並べず、worker は 1 つにする。CI の e2e と evidence の project には入れない。
 * 答えない hook の測定は約 93 秒かかるので、@slow を付け、run.sh の --quick で外す。
 */
export default defineConfig({
  testDir: 'measure',
  testMatch: /.*\.faults\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 5_000 },
  outputDir: 'results/.playwright',
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    timezoneId: TIMEZONE_ID,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
  },
})
