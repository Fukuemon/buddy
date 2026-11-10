import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF } from '../../fixtures/env'
import { recordBrowserDialogs } from '../../widgets/browserDialog/actions/browserDialog'

// 青木 陽菜（マネージャー）で撮る。ログインの状態は、evidence の project の storageState が setup から読む

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成', () => {
    test('schedule-create-dialog 日の表示で「予定を作成」を押した場合、予定の作成のダイアログが開くこと', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await intro(page, '日の表示で「予定を作成」を押すと、予定の作成のダイアログが開く')

      await step(page, '「予定を作成」を押す', () =>
        page.getByTestId('schedule-create-open').click(),
      )
      await check(page, '予定の作成のダイアログが開く', () =>
        expect(page.getByTestId('schedule-form-modal')).toBeVisible(),
      )
    })

    test('schedule-create-dialog-close 何も入れずに予定の作成のダイアログを閉じた場合、破棄の確認を出さずに日の表示に戻ること', async ({
      page,
    }) => {
      // 破棄の確認は window.confirm で、録画に映らない。出た回数を数えて字幕に出す
      const confirms = recordBrowserDialogs(page)
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await intro(
        page,
        '何も入れずに予定の作成のダイアログを閉じると、破棄の確認を出さずに日の表示に戻る',
      )

      await step(page, '予定の作成のダイアログを、何も入れずに開く', async () => {
        await page.getByTestId('schedule-create-open').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
      })
      await step(page, 'フッターの「キャンセル」を押す', () =>
        page.getByTestId('schedule-new-cancel').click(),
      )
      await check(
        page,
        [
          'ダイアログが閉じ、日の表示に戻る',
          '（撮影のため、録画に映らない破棄の確認の回数を出す）破棄の確認: 0 回',
        ].join('\n'),
        async () => {
          await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
          await expect(page).toHaveURL(/\/schedule\?(.+&)?view=day/)
          await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
          expect(confirms).toEqual([])
        },
      )
    })
  })
})
