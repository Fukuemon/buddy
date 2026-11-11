import { expect, test } from '@playwright/test'

import { check, intro } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

test.describe('予定の作成', () => {
  test.describe('ダイアログのヘッダー（ログインなし、Storybook の story）', () => {
    test('schedule-form-header 予定の作成のダイアログを開いた場合、タイトルが左端に、種類のタブが右端に出て、閉じるボタンが出ないこと', async ({
      page,
    }) => {
      await page.goto(storyUrl('画面-schedule-scheduleformmodal--visit'))
      await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
      await intro(
        page,
        '予定の作成のダイアログを開き、ヘッダーのタイトルと種類のタブの位置を見る\n前提 予定の作成のダイアログ（Storybook の ScheduleFormModal の Visit）を開いている',
      )

      // 並びの順と位置は Modal.test.tsx と ScheduleFormModal.test.tsx で確認し、ここでは見た目を撮る
      await check(
        page,
        'タイトルの「予定の作成」がヘッダーの左端に、通常と訪問のタブが右端に出て、閉じるボタン（×）は出ない',
        async () => {
          await expect(page.getByTestId('schedule-kind-tab')).toBeVisible()
          await expect(page.getByTestId('modal-close')).toHaveCount(0)
        },
      )
    })
  })
})
