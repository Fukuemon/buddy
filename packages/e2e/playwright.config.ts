import { defineConfig, devices } from '@playwright/test'

import { resolveLocalhostToLoopback } from './localhostResolver'
import { BASE_URL, LOGIN_STATE, TIMEZONE_ID } from './tests/fixtures/env'
import { DESKTOP_VIEWPORT } from './tests/fixtures/recording'
import { TIMEOUT_MS } from './tests/fixtures/timeouts'

// 設定は、test の runner と worker のそれぞれで読まれるので、両方のプロセスで差し替わる
resolveLocalhostToLoopback()

/**
 * ルートの compose で立てた全体に向けて流す。先に `portless compose up -d --build --wait` で起動しておく。
 * spec は職員ごとのログインの状態のファイルを共有するので、worker は 1 つにする。
 * evidence の project はエビデンスの動画を撮る spec を流す。`pnpm e2e` と CI は e2e の project だけを流し、evidence は
 * `pnpm --filter @buddy/e2e evidence` で、撮影の config（playwright.capture.config.ts）を付けて流す。
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
    // ローカル環境の portless の証明書は、管理者の権限が無いとシステムに信頼させられない（ADR-0036）。
    // ローカルの環境だけに向けて流すので、https の URL のときは証明書のエラーを無視する
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
  },
  projects: [
    // 撮影の config で流しても、ログインの場面を録画しない
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/, use: { video: 'off' } },
    {
      name: 'e2e',
      testMatch: /tests\/specs\/.*\.e2e\.ts/,
      dependencies: ['setup'],
      use: { storageState: LOGIN_STATE },
    },
    // 画面の大きさは、撮影の config の録画の大きさと同じにする。
    // storageState は project に置かない。テストの中の browser.newContext() も project の use を継ぐので、
    // kit の spec の前準備と、別の職員でトークンを取る処理が、ログイン済みの状態で始まってしまう。spec が describe ごとに test.use で選ぶ
    {
      name: 'evidence',
      testMatch: /tests\/evidence\/.*\.e2e\.ts/,
      timeout: TIMEOUT_MS.evidence,
      dependencies: ['setup'],
      use: { viewport: DESKTOP_VIEWPORT },
    },
  ],
})
