import { expect, test, type Page } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LEADER, LOGIN_STAFF, RECEIPT_TESTDATA, TEAM_MEMBER } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { addPolicy, issueManagerToken, newStaff, registerStaff } from '../../fixtures/staff'
import { fillApiToken, openApiClient } from '../../screens/apiReference'
import { signInAtBroker } from '../../screens/login'
import { apiClient } from '../../selectors/apiReference'

/** 照合の権限（receipt.check）。予定の API のマイグレーション（000008）が入れる。 */
const RECEIPT_CHECK_POLICY = '01M69C7BNKSXX7PPWX7SWZGFWK'

/** 予定の API のシードの、1 つ目の事業所の事務の役職。デフォルトの権限に照合の権限を持つ。 */
const CLERK_POSITION = '01M69C7BTRKYP0EQD62TQ2KARJ'

/** 予定の CSV と実績の CSV で照合し、結果の画面が開くまでを撮る。 */
const checkWithCsv = async (page: Page, step: (text: string) => Promise<void>) => {
  await step(
    '予定の取り方に「予定の CSV」を選び、予定の CSV と実績の CSV を選んで「照合する」を押す',
  )
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
  await expect(page.getByTestId('receipt-summary-mismatch')).toHaveText('3 件')
}

test.describe('照合の権限', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}事務の職員がログインした場合、ナビゲーションに照合が出て照合できること`, async ({
      browser,
    }) => {
      const clerk = newStaff('clerk')
      await recordPrEvidence(
        browser,
        {
          name: 'receipt-permission-clerk',
          title: '事務の職員がログインすると、ナビゲーションに照合が出て、照合できる',
          actor: `${clerk.name}（事務、照合の権限あり）`,
          variant,
        },
        async (page) => {
          const manager = await issueManagerToken(page.request)
          const res = await registerStaff(page.request, manager, {
            ...clerk,
            positionId: CLERK_POSITION,
          })
          expect(res.status()).toBe(201)
          await page.goto('/schedule')
          await signInAtBroker(page, clerk.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          const nav = page.getByTestId('site-nav')
          await expect(nav).toBeVisible()
          await step('事務の役職で登録した職員で、予定のカレンダーを開いている')

          await expect(nav.getByTestId('site-nav-receipt')).toBeVisible()
          await check('ナビゲーションに「照合」が出る')

          await step('ナビゲーションの「照合」を押す')
          await nav.getByTestId('site-nav-receipt').click()
          await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
          await checkWithCsv(page, step)
          await check('照合の結果の画面が開き、不整合データが 3 件と出る')
        },
      )
    })

    test(`${prefix}チームリーダーがログインした場合、ナビゲーションに照合が出ず照合の URL を開くと権限が無い表示になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'receipt-permission-leader-forbidden',
          title:
            'チームリーダーがログインすると、ナビゲーションに照合が出ず、照合の URL を開くと権限が無い表示になる',
          actor: `${LEADER.staff.name}（チームリーダー、照合の権限なし）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          const nav = page.getByTestId('site-nav')
          await expect(nav).toBeVisible()
          await step('予定のカレンダーを開いている')

          await expect(nav.getByTestId('site-nav-schedule')).toBeVisible()
          await expect(nav.getByTestId('site-nav-receipt')).toHaveCount(0)
          await check('ナビゲーションに「照合」が出ない')

          await step('照合の画面の URL（/receipt）を直に開く')
          await page.goto('/receipt')
          const forbidden = page.getByTestId('page-forbidden')
          await expect(forbidden).toContainText('この画面を開く権限がありません')
          await expect(forbidden).toContainText('照合の権限を持つ職員だけが開けます')
          await expect(page.getByTestId('receipt-check-submit')).toHaveCount(0)
          await check(
            '照合の入力を出さず、「この画面を開く権限がありません」と照合の権限が要ることが出る',
          )
        },
      )
    })

    test(`${prefix}照合の権限を持たない職員が照合の API を呼んだ場合、403 が返ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'receipt-permission-api-forbidden',
          title: '照合の権限を持たない職員が、照合の API を呼ぶと 403 が返る',
          actor: `${LEADER.staff.name}（チームリーダー、照合の権限なし）`,
          variant,
        },
        prepareApiReference('receipt', LEADER.email),
        async ({ page, step, check }, token) => {
          await routeApiReference(page)
          await openApiClient(page, 'receipt', { tag: 'check', method: 'post', path: '/v1/checks' })
          await step(
            '照合の API の参照のページで「実訪問の CSV と予定を照合する」のリクエストを開いている',
          )

          await step(
            `認証の欄に ${LEADER.staff.name} のトークンを入れ（伏せ字で出る）、リクエストを送る`,
          )
          await fillApiToken(page, token)
          await apiClient(page).send.click()
          await expect(apiClient(page).dialog).toContainText('403 Forbidden')
          await expect(apiClient(page).dialog).toContainText('"code": "forbidden"')
          await expect(apiClient(page).dialog).toContainText('照合の権限がない')
          await check(
            '本文を読む前に 403 が返り、code は forbidden、message は「照合の権限がない」になる',
          )
        },
      )
    })

    test(`${prefix}職員の管理の権限を持つ職員がメンバーに照合の権限を足した場合、そのメンバーが照合できること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'receipt-permission-granted-member',
          title: `${LOGIN_STAFF.name}（マネージャー）が ${TEAM_MEMBER.name}（メンバー）に照合の権限を足すと、${TEAM_MEMBER.name} が照合できる`,
          actor: `${TEAM_MEMBER.name}（メンバー、照合の権限を足した後）`,
          variant,
        },
        async (page) => {
          const manager = await issueManagerToken(page.request)
          const res = await addPolicy(page.request, manager, TEAM_MEMBER.id, RECEIPT_CHECK_POLICY)
          expect([201, 409]).toContain(res.status())
          await page.goto('/schedule')
          await signInAtBroker(page, TEAM_MEMBER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          const nav = page.getByTestId('site-nav')
          await expect(nav).toBeVisible()
          await step(
            `${LOGIN_STAFF.name} が照合の権限を足した後に、${TEAM_MEMBER.name} でログインし、予定のカレンダーを開いている`,
          )

          await expect(nav.getByTestId('site-nav-receipt')).toBeVisible()
          await check('ナビゲーションに「照合」が出る')

          await step('ナビゲーションの「照合」を押す')
          await nav.getByTestId('site-nav-receipt').click()
          await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
          await checkWithCsv(page, step)
          await check('照合の結果の画面が開き、不整合データが 3 件と出る')
        },
      )
    })
  }
})
