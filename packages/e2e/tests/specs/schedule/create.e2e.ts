import { expect, test } from '@playwright/test'

import { LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成', () => {
    test('通常の予定を作った場合、日の表示の予定者の列にその予定が出ること', async ({ page }) => {
      // 走らせるたびに予定が増えるので、題名で今回の予定を見分ける
      const title = `E2E の会議 ${Date.now()}`
      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await expect(page.getByTestId('schedule-form-modal')).toBeVisible()

      await page.getByTestId('schedule-kind-tab-normal').check()
      await page.getByTestId('schedule-field-title').click()
      await page.getByTestId('schedule-form-title').fill(title)
      await page.getByTestId('schedule-field-staff').click()
      await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
      await page.getByTestId('schedule-create-submit').click()

      await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
      await expect(column.getByTestId(/^schedule-event-/).filter({ hasText: title })).toBeVisible()
    })

    test('訪問の予定を作った場合、日の表示の予定者の列にその利用者の訪問が 1 件増えること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
      await page.getByTestId('schedule-kind-tab-visit').check()
      await page.getByTestId('service-code-訪看I3').check()
      await expect(page.getByTestId('service-code-訪看I3')).toBeChecked()
      await expect(page.getByTestId('service-code-訪看I2')).not.toBeChecked()
      await page.getByTestId('schedule-field-patient').click()
      const patientOption = page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)
      // 利用者の一覧が届くまでは、カレンダーの訪問の題が「利用者不明 訪問」になるので、届いてから数える
      await expect(patientOption).toBeVisible()
      // 訪問の予定は題名を持たず、利用者の名前で出るので、作る前の件数と比べる
      const visits = page
        .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
      const before = await visits.count()

      await patientOption.check()
      await page.getByTestId('schedule-field-staff').click()
      await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
      await page.getByTestId('schedule-create-submit').click()

      await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      await expect(visits).toHaveCount(before + 1)
    })
  })
})
