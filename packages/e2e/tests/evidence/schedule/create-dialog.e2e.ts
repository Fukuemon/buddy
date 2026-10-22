import { expect, test } from '@playwright/test'

import { LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtIdp } from '../../screens/login'

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}日の表示で「予定を作成」を押した場合、予定の作成のダイアログが開くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-dialog',
            title: '日の表示で「予定を作成」を押すと、予定の作成のダイアログが開く',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtIdp(page, LOGIN_NAME)
          },
          async ({ page, step, check }) => {
            // 字幕は開いた画面の sessionStorage に置くので、画面を開いてから最初の字幕を出す
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押す')
            await page.getByTestId('schedule-create-open').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
            await check('予定の作成のダイアログが開く')
          },
        )
      })
    }
  })
})
