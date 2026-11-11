// web の BFF での見え方を測る。ブラウザと同じ道でログインし、access token の期限を書き換えて refresh を起こす。
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { BASE_URL } from '../../tests/fixtures/env'
import { issueManagerToken, newStaff, registerStaffId } from '../../tests/fixtures/staff'
import { signInAtBroker } from '../../tests/screens/login'
import { brokerLogin } from '../../tests/selectors/idp'
import { pageFailure } from '../../tests/selectors/page'
import { calendarColumnHeaders } from '../../tests/selectors/scheduleCalendar'
import { expireAccessToken, readServiceLogs, sessionExists } from './compose'
import { createApiContext } from './tokens'

/** 画面が出るまで待つ上限。BFF は refresh を 1 度だけ試し、Hydra を 5 秒まで待つ（ADR-0044）。 */
const PAGE_WAIT_MS = 30_000

/** 一時的に失敗した後の 10 秒と、読み直し 1 回の読み込みを足す。 */
const RECOVER_WAIT_MS = 25_000

/** 測るたびに、1 つ目の事業所のメンバーの職員を登録する。setup のセッションの access token を書き換えないためである。 */
export const registerFaultStaff = async (label: string) => {
  const staff = newStaff(`faults-${label}`)
  const request = await createApiContext()
  try {
    const token = await issueManagerToken()
    return { ...staff, id: await registerStaffId(request, token, staff), managerToken: token }
  } finally {
    await request.dispose()
  }
}

/** email の職員でブラウザからログインし、予定のカレンダーが出た context を返す。 */
export const signInWeb = async (browser: Browser, email: string) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
  })
  const page = await context.newPage()
  await page.goto('/schedule')
  await signInAtBroker(page, email)
  await expect(calendarColumnHeaders(page).first()).toBeVisible()
  return { context, page }
}

/** refresh を起こした表示の結果。 */
type WebObservation = {
  /**
   * unavailable は一時的に使えない画面か表示できない画面、login はブローカーのログインの画面、
   * login-failed は web のログインの失敗の画面（/auth/error）、calendar は予定のカレンダー。
   */
  outcome: 'unavailable' | 'login' | 'login-failed' | 'calendar' | 'none'
  seconds: number
  sessionKept: boolean
  /** web のログの session refresh failed の reason、error、status。無ければ空。 */
  refreshLog: string
}

/** web のログから、since の後の最後の session refresh failed の行を、reason、error、status の文にする。 */
const findLastRefreshFailure = (since: Date) => {
  const line = readServiceLogs('web', since)
    .split('\n')
    .filter((l) => l.includes('session refresh failed'))
    .at(-1)
  if (line === undefined) return ''
  try {
    const parsed = JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>
    return ['reason', 'error', 'status']
      .filter((k) => parsed[k] !== undefined)
      .map((k) => `${k}=${String(parsed[k])}`)
      .join(' ')
  } catch {
    return line.trim()
  }
}

/**
 * access token の期限を過ぎた時刻に書き換えて予定のカレンダーを開き、何が出たか、出るまでの秒、セッションが残ったかを返す。
 */
export const openAfterExpiry = async (
  context: BrowserContext,
  page: Page,
): Promise<WebObservation> => {
  await expireAccessToken(context)
  const since = new Date()
  const start = Date.now()
  await page.goto('/schedule', { timeout: PAGE_WAIT_MS }).catch(() => undefined)
  const failure = pageFailure(page).heading
  const login = brokerLogin(page).email
  const calendar = calendarColumnHeaders(page).first()
  // ログインの失敗の画面は testid を持たないので、URL で見分ける
  await Promise.race([
    expect(failure.or(login).or(calendar)).toBeVisible({ timeout: PAGE_WAIT_MS }),
    page.waitForURL((url) => url.pathname.startsWith('/auth/error'), { timeout: PAGE_WAIT_MS }),
  ]).catch(() => undefined)
  const seconds = Math.round((Date.now() - start) / 100) / 10
  const outcome = new URL(page.url()).pathname.startsWith('/auth/error')
    ? 'login-failed'
    : (await failure.isVisible())
      ? 'unavailable'
      : (await login.isVisible())
        ? 'login'
        : (await calendar.isVisible())
          ? 'calendar'
          : 'none'
  // ログの行が docker logs に出るのを待つ
  const refreshLog = await expect
    .poll(() => findLastRefreshFailure(since), { timeout: 5_000 })
    .not.toBe('')
    .then(() => findLastRefreshFailure(since))
    .catch(() => '')
  return { outcome, seconds, sessionKept: await sessionExists(context), refreshLog }
}

/** 故障を戻した後に、ログインし直さずに予定のカレンダーが出るまで読み直す。出たら true を返す。 */
export const recoversWithoutLogin = async (page: Page) =>
  expect(async () => {
    await page.goto('/schedule')
    await expect(calendarColumnHeaders(page).first()).toBeVisible()
  })
    .toPass({ timeout: RECOVER_WAIT_MS })
    .then(() => true)
    .catch(() => false)

/** 観測を、表のセルの文にする。 */
export const formatWebObservation = (o: WebObservation) =>
  `${o.outcome}（${o.seconds} 秒）、セッション${o.sessionKept ? 'は残る' : 'が消えた'}${o.refreshLog ? `、ログ ${o.refreshLog}` : ''}`
