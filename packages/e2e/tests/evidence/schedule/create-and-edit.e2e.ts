import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'

test.describe('予定のカレンダー', () => {
  test.describe(`予定の作成と変更（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-create-and-edit 通常の予定を作ってタイトルを変えた場合、日の表示と予定の詳細に変えた後のタイトルが出ること', async ({
      page,
    }) => {
      // 撮るたびに予定が増えるので、タイトルで今回の予定を見分ける
      const stamp = Date.now()
      const created = `会議 ${stamp}`
      const changed = `会議（場所を変更）${stamp}`
      await page.goto('/schedule?view=day')
      const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
      await expect(column).toBeVisible()
      await intro(
        page,
        '通常の予定を作ると日の表示に出て、タイトルを変えると予定の詳細に変えた後のタイトルが出る\n前提 予定のカレンダーを日の表示で開いている',
      )

      await step(page, '「予定を作成」を押し、通常の予定を選ぶ', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-normal').check()
      })
      await step(page, `タイトルに「${created}」を入れる`, async () => {
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(created)
      })
      await step(page, `予定者に ${LOGIN_STAFF.name} を選び、作成する`, async () => {
        await page.getByTestId('schedule-field-staff').click()
        await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
        await page.getByTestId('schedule-create-submit').click()
      })
      const event = column.getByTestId(/^schedule-event-/).filter({ hasText: created })
      await check(page, `日の表示の ${LOGIN_STAFF.name} の列に、作った予定が出る`, async () => {
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
        await expect(event).toBeVisible()
      })

      await step(page, '作った予定を開き、「編集」を押す', async () => {
        await event.click()
        await expect(page.getByTestId('schedule-detail-modal')).toContainText(created)
        await page.getByTestId('schedule-detail-edit').click()
      })
      await step(page, `タイトルを「${changed}」に変えて保存する`, async () => {
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(changed)
        await page.getByTestId('schedule-edit-submit').click()
      })
      await check(page, '予定の詳細に、変えた後のタイトルが出る', () =>
        expect(page.getByTestId('schedule-detail-modal')).toContainText(changed),
      )
    })
  })
})
