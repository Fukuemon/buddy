import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { recordBrowserDialogs } from '../../widgets/browserDialog/actions/browserDialog'

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
            await signInAtBroker(page, LOGIN_EMAIL)
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

      test(`${variant.label ? `${variant.label}: ` : ''}何も入れずに予定の作成のダイアログを閉じた場合、破棄の確認を出さずに日の表示に戻ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-dialog-close',
            title:
              '何も入れずに予定の作成のダイアログを閉じると、破棄の確認を出さずに日の表示に戻る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            // 破棄の確認は window.confirm で、録画に映らない。出た回数を数えて字幕に出す
            const confirms = recordBrowserDialogs(page)
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await page.getByTestId('schedule-create-open').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
            await step('予定の作成のダイアログを、何も入れずに開いている')

            await step('フッターの「キャンセル」を押す')
            await page.getByTestId('schedule-new-cancel').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
            await expect(page).toHaveURL(/\/schedule\?(.+&)?view=day/)
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            expect(confirms).toEqual([])
            await check(
              [
                'ダイアログが閉じ、日の表示に戻る',
                `（撮影のため、録画に映らない破棄の確認の回数を出す）破棄の確認: ${confirms.length} 回`,
              ].join('\n'),
            )
          },
        )
      })
    }
  })
})
