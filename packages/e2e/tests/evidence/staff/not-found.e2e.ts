import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'

/** 事業所にいない職員の ID。ID の形は合うが、シードにも撮影で作るデータにも無い。 */
const MISSING_STAFF_ID = '01M3TC5TRG5200KYWTZW6ER3ZZ'

test.describe('職員の詳細', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('staff-detail-not-found 職員の管理の権限を持つ職員が無い職員の ID で職員の詳細を開いた場合、職員が見つからないことと開き直す先が出ること', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-table')).toBeVisible()
      await intro(
        page,
        '無い職員の ID で職員の詳細を開くと、職員が見つからないことと開き直す先が出る',
      )

      await step(
        page,
        `無い職員の ID（${MISSING_STAFF_ID}）で、職員の詳細の URL を開く`,
        async () => {
          await page.goto(`/staff/${MISSING_STAFF_ID}`)
        },
      )
      await check(
        page,
        '「職員が見つかりません。職員の一覧から開き直してください。」が出て、読み直すは出ない',
        async () => {
          await expect(page.getByTestId('staff-detail-error')).toHaveText(
            '職員が見つかりません。職員の一覧から開き直してください。',
          )
          await expect(page.getByTestId('staff-detail-retry')).toHaveCount(0)
        },
      )
    })
  })
})
