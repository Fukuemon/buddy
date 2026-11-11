import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { prepareOutsideRecording } from '../../fixtures/recording'
import {
  brokerHealth,
  countFailedHookCalls,
  expireAccessToken,
  pauseBroker,
  restoreBroker,
  sessionExists,
  stopBroker,
} from '../../fixtures/sessionFaults'
import { issueManagerToken, leaveStaff, newStaff, registerStaffId } from '../../fixtures/staff'
import { BROKER_RESTORE_WAIT, REFRESH_FAILURE_WAIT, SESSION_FAULT_TEST } from '../../fixtures/timeouts'
import { signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'
import { pageFailure } from '../../selectors/page'
import { calendarColumnHeaders } from '../../selectors/scheduleCalendar'

/**
 * 録画の外で 1 つ目の事業所のメンバーの職員を登録し、その職員でログインした cookie を context に移す。
 * 撮る職員を毎回作り、ほかの spec が使う setup のセッションの access token を書き換えないためである。
 */
const signInNewStaff = async (
  browser: Browser,
  context: BrowserContext,
  request: APIRequestContext,
  label: string,
) => {
  const staff = newStaff(label)
  const token = await issueManagerToken()
  const id = await registerStaffId(request, token, staff)
  await prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, staff.email)
    await expect(calendarColumnHeaders(page).first()).toBeVisible()
  })
  return { ...staff, id, token }
}

/** 戻したブローカーのヘルスチェックが通るまで待つ。 */
const waitBrokerHealthy = () =>
  expect(() => expect(brokerHealth()).toBe('healthy')).toPass(BROKER_RESTORE_WAIT)

test.describe('ログインの期限の延長', () => {
  test.describe.configure(SESSION_FAULT_TEST)

  test.afterEach(async () => {
    // 失敗したテストでも、次のテストのためにブローカーを戻す
    restoreBroker()
    await waitBrokerHealthy()
  })

  test.describe('1 つ目の事業所のメンバー（撮るたびに登録する職員）', () => {
    test(
      'session-refresh-broker-down ブローカーが止まっている間に access token が切れた場合、一時的に使えないことを示す画面が出てログインが残ること',
      { tag: '@compare' },
      async ({ browser, context, request }) => {
        await signInNewStaff(browser, context, request, 'refresh-broker-down')
        await expireAccessToken(context)
        stopBroker()
        const page = await context.newPage()
        await page.goto('about:blank')
        await intro(
          page,
          [
            'ブローカーが止まっている間に access token が切れると、一時的に使えない画面が出て、ログインは残る',
            '前提 録画の前にログインし、撮影のため access token の期限を過ぎた時刻に書き換え、ブローカーを止めた',
          ].join('\n'),
        )

        const since = new Date()
        let seconds = 0
        await step(page, '予定のカレンダーを開く', async () => {
          await page.goto('/schedule', REFRESH_FAILURE_WAIT)
          await expect(pageFailure(page).heading).toBeVisible(REFRESH_FAILURE_WAIT)
          seconds = Math.round((Date.now() - since.getTime()) / 1000)
        })
        await check(page, '一時的に使えないことを示す画面が出て、web のセッションが残る', async () => {
          await expect(pageFailure(page).heading).toBeVisible()
          expect(await sessionExists(context)).toBe(true)
        })
        const hookCalls = countFailedHookCalls(since)
        await check(
          page,
          `（撮影のため、録画に映らない値を出す）画面が出るまで約 ${seconds} 秒、Hydra が token_hook を呼んで失敗した回数は ${hookCalls} 回`,
          async () => {
            expect(hookCalls).toBeGreaterThan(0)
          },
        )
      },
    )

    test(
      'session-refresh-recovered ブローカーが答えない間に一時的に使えない画面が出た後でブローカーを戻して読み直した場合、ログインし直さずに画面が出ること',
      { tag: '@compare' },
      async ({ browser, context, request }) => {
        await signInNewStaff(browser, context, request, 'refresh-recovered')
        await expireAccessToken(context)
        pauseBroker()
        const page = await context.newPage()
        await page.goto('about:blank')
        await intro(
          page,
          [
            'ブローカーが答えない間は一時的に使えない画面が出て、ブローカーを戻して読み直すと、ログインし直さずに画面が出る',
            '前提 録画の前にログインし、撮影のため access token の期限を過ぎた時刻に書き換え、ブローカーを一時停止した',
          ].join('\n'),
        )

        await step(page, '予定のカレンダーを開く', async () => {
          await page.goto('/schedule', REFRESH_FAILURE_WAIT)
          await expect(pageFailure(page).heading).toBeVisible(REFRESH_FAILURE_WAIT)
        })
        await check(page, '一時的に使えないことを示す画面が出る', () =>
          expect(pageFailure(page).heading).toBeVisible(),
        )

        await step(page, '撮影のため、ブローカーを戻し、ヘルスチェックが通るまで待つ', async () => {
          restoreBroker()
          await waitBrokerHealthy()
        })
        await step(page, '「読み直す」を押す', () =>
          pageFailure(page).reload.click(),
        )
        await check(page, 'ログインの画面を通らずに、予定のカレンダーが出る', async () => {
          await expect(calendarColumnHeaders(page).first()).toBeVisible()
          await expect(brokerLogin(page).email).toHaveCount(0)
        })
      },
    )

    test(
      'session-refresh-rejected 休職にした職員の access token が切れた場合、セッションが消えてログインの画面に戻ること',
      { tag: '@compare' },
      async ({ browser, context, request }) => {
        const staff = await signInNewStaff(browser, context, request, 'refresh-rejected')
        expect((await leaveStaff(request, staff.token, staff.id)).status()).toBe(200)
        await expireAccessToken(context)
        const page = await context.newPage()
        await page.goto('about:blank')
        await intro(
          page,
          [
            '休職にした職員の access token が切れると、今と同じく、セッションが消えてログインの画面に戻る',
            '前提 録画の前にログインし、予定の API でこの職員を休職にし、撮影のため access token の期限を過ぎた時刻に書き換えた',
          ].join('\n'),
        )

        await step(page, '予定のカレンダーを開く', async () => {
          await page.goto('/schedule')
        })
        await check(page, 'ブローカーのメールの入力の画面に戻り、web のセッションが消える', async () => {
          await expect(brokerLogin(page).email).toBeVisible()
          expect(await sessionExists(context)).toBe(false)
        })
      },
    )
  })
})
