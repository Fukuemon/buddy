import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'

/** 事業所にいない利用者の ID。ID の形は合うが、シードにも撮影で作るデータにも無い。 */
const MISSING_PATIENT_ID = '01M3TC5TRG5200KYWTZW6ER3ZZ'

test.describe('利用者の詳細', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('patient-detail-not-found 職員の管理の権限を持つ職員が無い利用者の ID で利用者の詳細を開いた場合、利用者が見つからないことと開き直す先が出ること', async ({
      page,
    }) => {
      await page.goto('/patients')
      await expect(page.getByTestId('patient-list-table')).toBeVisible()
      await intro(
        page,
        '無い利用者の ID で利用者の詳細を開くと、利用者が見つからないことと開き直す先が出る',
      )

      await step(
        page,
        `無い利用者の ID（${MISSING_PATIENT_ID}）で、利用者の詳細の URL を開く`,
        async () => {
          await page.goto(`/patients/${MISSING_PATIENT_ID}`)
        },
      )
      await check(
        page,
        '「利用者が見つかりません。利用者の一覧から開き直してください。」が出て、読み直すは出ない',
        async () => {
          await expect(page.getByTestId('patient-detail-error')).toHaveText(
            '利用者が見つかりません。利用者の一覧から開き直してください。',
          )
          await expect(page.getByTestId('patient-detail-retry')).toHaveCount(0)
        },
      )
    })
  })
})
