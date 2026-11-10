import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  LEADER,
  LEADER_STATE,
  LOGIN_STAFF,
  RECEIPT_TESTDATA,
  TEAM_MEMBER,
} from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { addPolicy, issueManagerToken, newStaff, registerStaff } from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import { signInAtBroker } from '../../screens/login'
import { fillApiToken } from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

/** 照合の権限（receipt.check）。予定の API のマイグレーション（000009）が入れる。 */
const RECEIPT_CHECK_POLICY = '01M69C7BNKSXX7PPWX7SWZGFWK'

/** 予定の API のシードの、1 つ目の事業所の事務の役職。デフォルトの権限に照合の権限を持つ。 */
const CLERK_POSITION = '01M69C7BTRKYP0EQD62TQ2KARJ'

/**
 * 録画のブラウザと cookie を分けたリクエストで、マネージャーとして fn を呼ぶ。
 * 同じブラウザでマネージャーのトークンを取ると、Hydra のログインの状態が残り、録画の職員でログインできないためである。
 */
const asManager = async <T>(fn: (api: APIRequestContext, token: string) => Promise<T>) => {
  const api = await request.newContext()
  try {
    return await fn(api, await issueManagerToken())
  } finally {
    await api.dispose()
  }
}

/** 予定のカレンダーを開き、ナビゲーションが出るまで待つ。ナビゲーションを返す。 */
const openSchedule = async (page: Page) => {
  await page.goto('/schedule')
  const nav = page.getByTestId('site-nav')
  await expect(nav).toBeVisible()
  return nav
}

/** ナビゲーションの「照合」から照合の画面を開き、予定の CSV と実績の CSV で照合して、結果の画面が開くまでを撮る。 */
const checkWithCsvFromNav = async (page: Page, nav: ReturnType<Page['getByTestId']>) => {
  await step(page, 'ナビゲーションの「照合」を押す', async () => {
    await nav.getByTestId('site-nav-receipt').click()
    await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
  })
  await step(
    page,
    '予定の取り方に「予定の CSV」を選び、予定の CSV と実績の CSV を選んで「照合する」を押す',
    async () => {
      await page.getByTestId('receipt-source-csv').check()
      await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
      await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
      await page.getByTestId('receipt-check-submit').click()
      await expect(page).toHaveURL(/\/receipt\/result$/)
    },
  )
  await check(page, '照合の結果の画面が開き、不整合データが 3 件と出る', () =>
    expect(page.getByTestId('receipt-category-mismatch')).toHaveText('不整合データ（3 件）'),
  )
}

test.describe('照合の権限', () => {
  test.describe('事務の役職で登録した職員（照合の権限あり）', () => {
    test('receipt-permission-clerk 事務の職員がログインした場合、ナビゲーションに照合が出て照合できること', async ({
      browser,
      context,
    }) => {
      const clerk = newStaff('clerk')
      await prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
        const res = await asManager((api, token) =>
          registerStaff(api, token, { ...clerk, positionId: CLERK_POSITION }),
        )
        expect(res.status()).toBe(201)
        await page.goto('/schedule')
        await signInAtBroker(page, clerk.email)
      })

      const page = await context.newPage()
      const nav = await openSchedule(page)
      await intro(
        page,
        `事務の職員がログインすると、ナビゲーションに照合が出て、照合できる\n前提 事務の役職で登録した職員（${clerk.name}）でログインし、予定のカレンダーを開いている`,
      )

      await check(page, 'ナビゲーションに「照合」が出る', () =>
        expect(nav.getByTestId('site-nav-receipt')).toBeVisible(),
      )
      await checkWithCsvFromNav(page, nav)
    })
  })

  test.describe(`${LEADER.staff.name}（チームリーダー、照合の権限なし）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('receipt-permission-leader-forbidden チームリーダーがログインした場合、ナビゲーションに照合が出ず照合の URL を開くと権限が無い表示になること', async ({
      page,
    }) => {
      const nav = await openSchedule(page)
      await intro(
        page,
        `チームリーダーがログインすると、ナビゲーションに照合が出ず、照合の URL を開くと権限が無い表示になる\n前提 ${LEADER.staff.name} でログインし、予定のカレンダーを開いている`,
      )

      await check(page, 'ナビゲーションに「照合」が出ない', async () => {
        await expect(nav.getByTestId('site-nav-schedule')).toBeVisible()
        await expect(nav.getByTestId('site-nav-receipt')).toHaveCount(0)
      })

      await step(page, '照合の画面の URL（/receipt）を直に開く', async () => {
        await page.goto('/receipt')
      })
      await check(
        page,
        '照合の入力を出さず、「この画面を開く権限がありません」と照合の権限が要ることが出る',
        async () => {
          const forbidden = page.getByTestId('page-forbidden')
          await expect(forbidden).toContainText('この画面を開く権限がありません')
          await expect(forbidden).toContainText('照合の権限を持つ職員だけが開けます')
          await expect(page.getByTestId('receipt-check-submit')).toHaveCount(0)
        },
      )
    })
  })

  test.describe(`${LEADER.staff.name}（チームリーダー、照合の権限なし、API の参照のページ）`, () => {
    test('receipt-permission-api-forbidden 照合の権限を持たない職員が照合の API を呼んだ場合、403 が返ること', async ({
      browser,
      context,
    }) => {
      const token = await prepareOutsideRecording(browser, {}, (page) =>
        issueAccessToken(page.request, LEADER.email),
      )

      const page = await context.newPage()
      await routeApiReference(page)
      await openApiClient(page, 'receipt', { tag: 'check', method: 'post', path: '/v1/checks' })
      await expect(apiClient(page).send).toBeVisible()
      await intro(
        page,
        '照合の権限を持たない職員が、照合の API を呼ぶと 403 が返る\n前提 照合の API の参照のページで「実訪問の CSV と予定を照合する」のリクエストを開いている',
      )

      await step(
        page,
        `認証の欄に ${LEADER.staff.name} のトークンを入れ（伏せ字で出る）、リクエストを送る`,
        async () => {
          await fillApiToken(page, token)
          await apiClient(page).send.click()
        },
      )
      await check(
        page,
        '本文を読む前に 403 が返り、code は forbidden、message は「照合の権限がない」になる',
        async () => {
          await expect(apiClient(page).dialog).toContainText('403 Forbidden')
          await expect(apiClient(page).dialog).toContainText('"code": "forbidden"')
          await expect(apiClient(page).dialog).toContainText('照合の権限がない')
        },
      )
    })
  })

  test.describe(`${TEAM_MEMBER.name}（メンバー、照合の権限を足した後）`, () => {
    test('receipt-permission-granted-member 職員の管理の権限を持つ職員がメンバーに照合の権限を足した場合、そのメンバーが照合できること', async ({
      browser,
      context,
    }) => {
      await prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
        const res = await asManager((api, token) =>
          addPolicy(api, token, TEAM_MEMBER.id, RECEIPT_CHECK_POLICY),
        )
        expect([201, 409]).toContain(res.status())
        await page.goto('/schedule')
        await signInAtBroker(page, TEAM_MEMBER.email)
      })

      const page = await context.newPage()
      const nav = await openSchedule(page)
      await intro(
        page,
        `${LOGIN_STAFF.name}（マネージャー）が ${TEAM_MEMBER.name}（メンバー）に照合の権限を足すと、${TEAM_MEMBER.name} が照合できる\n前提 ${LOGIN_STAFF.name} が照合の権限を足した後に、${TEAM_MEMBER.name} でログインし、予定のカレンダーを開いている`,
      )

      await check(page, 'ナビゲーションに「照合」が出る', () =>
        expect(nav.getByTestId('site-nav-receipt')).toBeVisible(),
      )
      await checkWithCsvFromNav(page, nav)
    })
  })
})
