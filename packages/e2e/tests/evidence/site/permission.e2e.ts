import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

/** ブラウザが BFF に送った操作の名前を集める。BFF の server function は、操作の名前を本文に入れて送る。 */
const collectOperations = (page: Page) => {
  const bodies: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') bodies.push(request.postData() ?? '')
  })
  return (operation: string) => bodies.filter((body) => body.includes(`"${operation}"`)).length
}

test.describe('画面の権限', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の管理の権限を持たない職員が職員の画面を開いた場合、URL を変えずに権限が無い表示を出し、職員の一覧を読まないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-permission-staff-forbidden',
          title:
            '職員の管理の権限を持たない職員が職員の画面を開くと、URL を変えずに権限が無い表示が出て、職員の一覧を読まない',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await step('予定のカレンダーを開いている')

          const sent = collectOperations(page)
          await step('職員の画面の URL（/staff）を直に開く')
          await page.goto('/staff')
          const forbidden = page.getByTestId('page-forbidden')
          await expect(forbidden).toContainText('この画面を開く権限がありません')
          await expect(forbidden).toContainText('職員の管理の権限を持つ職員だけが開けます')
          await expect(page).toHaveURL(/\/staff$/)
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await expect(page.getByTestId('staff-list-table')).toHaveCount(0)
          expect(sent('staff.listRecords')).toBe(0)
          await check(
            [
              'URL は /staff のまま、画面の枠の中に「この画面を開く権限がありません」と職員の管理の権限が要ることが出る',
              `（撮影のため、録画に映らないブラウザの送信の回数を出す）職員の一覧の操作の送信: ${sent('staff.listRecords')} 回`,
            ].join('\n'),
          )
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が予定の取り込みの画面を開いた場合、権限が無い表示を出すこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-permission-import-forbidden',
          title:
            '職員の管理の権限を持たない職員が予定の取り込みの画面を開くと、権限が無い表示が出る',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await step('予定のカレンダーを開いている')

          await step('予定の取り込みの画面の URL（/schedule/import）を直に開く')
          await page.goto('/schedule/import')
          await expect(page.getByTestId('page-forbidden')).toContainText(
            '職員の管理の権限を持つ職員だけが開けます',
          )
          await expect(page).toHaveURL(/\/schedule\/import$/)
          await expect(page.getByTestId('calendar-import-staff')).toHaveCount(0)
          await check('取り込みの入力を出さず、職員の管理の権限が要ることが出る')
        },
      )
    })

    test(`${prefix}職員の管理と照合の権限を持つ職員が職員、取り込み、照合の画面を開いた場合、権限が無い表示を出さずに画面を出すこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-permission-manager-allowed',
          title:
            '職員の管理と照合の権限を持つ職員が職員、取り込み、照合の画面を開くと、権限が無い表示を出さずに画面が出る',
          actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理と照合の権限あり）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await step('予定のカレンダーを開いている')

          await step('ナビゲーションの「職員」を押す')
          await page.getByTestId('site-nav-staff').click()
          await expect(page.getByTestId('staff-list-table')).toBeVisible()
          await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
          await check('職員の一覧が出る')

          await step('ナビゲーションの「取り込み」を押す')
          await page.getByTestId('site-nav-import').click()
          await expect(page.getByTestId('calendar-import-staff')).toBeVisible()
          await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
          await check('予定の取り込みの入力が出る')

          await step('ナビゲーションの「照合」を押す')
          await page.getByTestId('site-nav-receipt').click()
          await expect(page.getByTestId('receipt-check-form')).toBeVisible()
          await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
          await check('照合の入力が出る')
        },
      )
    })
  }
})
