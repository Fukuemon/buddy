import { defineConfig, devices } from '@playwright/test'

import { resolveLocalhostToLoopback } from './localhostResolver'
import { BASE_URL, LOGIN_STATE, TIMEZONE_ID } from './tests/fixtures/env'
import { TIMEOUT_MS } from './tests/fixtures/timeouts'

// 設定は、test の runner と worker のそれぞれで読まれるので、両方のプロセスで差し替わる
resolveLocalhostToLoopback()

/**
 * ルートの compose で立てた全体に向けて流す。先に `docker compose up --build --wait` で起動しておく。
 * spec は職員ごとのログインの状態のファイルを共有するので、worker は 1 つにする（kit の ensureSavedLogin のドキュメントコメント）。
 * evidence の project はエビデンスの動画を撮る spec を流す。`pnpm e2e` と CI は e2e の project だけを流し、evidence は `pnpm --filter @buddy/e2e evidence` で流す。
 */
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: TIMEOUT_MS.test,
  expect: { timeout: TIMEOUT_MS.expect },
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    // 予定の API と calendarpit は Asia/Tokyo の時刻で予定を持つ。CI の UTC で画面の時刻がずれないよう、事業所の時間帯にそろえる
    timezoneId: TIMEZONE_ID,
    actionTimeout: TIMEOUT_MS.action,
    navigationTimeout: TIMEOUT_MS.navigation,
    trace: 'retain-on-failure',
    // worktree の環境の portless の証明書は、管理者の権限が無いとシステムに信頼させられない（ADR-0035）。
    // ローカルの環境だけに向けて流すので、https の URL のときは証明書のエラーを無視する
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
  },
  projects: [
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/ },
    {
      name: 'e2e',
      testMatch: /tests\/specs\/.*\.e2e\.ts/,
      dependencies: ['setup'],
      use: { storageState: LOGIN_STATE },
    },
    // 録画は recordEvidence が新しいコンテキストで撮り、prepare の中でログインするので、setup に依らない
    { name: 'evidence', testMatch: /tests\/evidence\/.*\.e2e\.ts/, timeout: TIMEOUT_MS.evidence },
  ],
})
