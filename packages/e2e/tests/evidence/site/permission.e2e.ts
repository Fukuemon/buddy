import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { pageHeading } from '../../selectors/page'

/** ブラウザが BFF に送った操作の名前を集める。BFF の server function は、操作の名前を本文に入れて送る。 */
const collectOperations = (page: Page) => {
  const bodies: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') bodies.push(request.postData() ?? '')
  })
  return (operation: string) => bodies.filter((body) => body.includes(`"${operation}"`)).length
}

const openSchedule = async (page: Page) => {
  await page.goto('/schedule')
  await expect(page.getByTestId('site-nav')).toBeVisible()
}

test.describe('画面の権限', () => {
  test.describe(`${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('site-permission-staff-forbidden 職員の管理の権限を持たない職員が職員の画面を開いた場合、URL を変えずに権限が無い表示を出し、職員の一覧を読まないこと', async ({
      page,
    }) => {
      await openSchedule(page)
      await intro(
        page,
        '職員の管理の権限を持たない職員が職員の画面を開くと、URL を変えずに権限が無い表示が出て、職員の一覧を読まない\n前提 予定のカレンダーを開いている',
      )

      const sent = collectOperations(page)
      await step(page, '職員の画面の URL（/staff）を直に開く', async () => {
        await page.goto('/staff')
      })
      await check(
        page,
        [
          'URL は /staff のまま、画面の枠の中に「この画面を開く権限がありません」と職員の管理の権限が要ることが出る',
          '（撮影のため、録画に映らないブラウザの送信の回数を出す）職員の一覧の操作の送信: 0 回',
        ].join('\n'),
        async () => {
          const forbidden = page.getByTestId('page-forbidden')
          await expect(forbidden).toContainText('この画面を開く権限がありません')
          await expect(forbidden).toContainText('職員の管理の権限を持つ職員だけが開けます')
          await expect(page).toHaveURL(/\/staff$/)
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await expect(page.getByTestId('staff-list-table')).toHaveCount(0)
          expect(sent('staff.listRecords')).toBe(0)
        },
      )
    })

    test('site-permission-import-forbidden 職員の管理の権限を持たない職員が予定の取り込みの画面を開いた場合、権限が無い表示を出すこと', async ({
      page,
    }) => {
      await openSchedule(page)
      await intro(
        page,
        '職員の管理の権限を持たない職員が予定の取り込みの画面を開くと、権限が無い表示が出る\n前提 予定のカレンダーを開いている',
      )

      await step(page, '予定の取り込みの画面の URL（/schedule/import）を直に開く', async () => {
        await page.goto('/schedule/import')
      })
      await check(page, '取り込みの入力を出さず、職員の管理の権限が要ることが出る', async () => {
        await expect(page.getByTestId('page-forbidden')).toContainText(
          '職員の管理の権限を持つ職員だけが開けます',
        )
        await expect(page).toHaveURL(/\/schedule\/import$/)
        await expect(pageHeading(page, '予定の取り込み')).toHaveCount(0)
      })
    })
  })

  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理と照合の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('site-permission-manager-allowed 職員の管理と照合の権限を持つ職員が職員、取り込み、照合の画面を開いた場合、権限が無い表示を出さずに画面を出すこと', async ({
      page,
    }) => {
      await openSchedule(page)
      await intro(
        page,
        '職員の管理と照合の権限を持つ職員が職員、取り込み、照合の画面を開くと、権限が無い表示を出さずに画面が出る\n前提 予定のカレンダーを開いている',
      )

      await step(
        page,
        'ナビゲーションの「職員」を押す',
        () => page.getByTestId('site-nav-staff').click(),
        { position: 'bottom' },
      )
      await check(page, '職員の一覧が出る', async () => {
        await expect(page.getByTestId('staff-list-table')).toBeVisible()
        await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
      })

      await step(
        page,
        'ナビゲーションの「取り込み」を押す',
        () => page.getByTestId('site-nav-import').click(),
        { position: 'bottom' },
      )
      await check(page, '予定の取り込みの画面が出る', async () => {
        await expect(pageHeading(page, '予定の取り込み')).toBeVisible()
        await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
      })

      await step(
        page,
        'ナビゲーションの「照合」を押す',
        () => page.getByTestId('site-nav-receipt').click(),
        { position: 'bottom' },
      )
      await check(page, '照合の入力が出る', async () => {
        await expect(page.getByTestId('receipt-check-form')).toBeVisible()
        await expect(page.getByTestId('page-forbidden')).toHaveCount(0)
      })
    })
  })
})
