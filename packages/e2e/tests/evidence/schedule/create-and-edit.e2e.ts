import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成と変更', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}通常の予定を作ってタイトルを変えた場合、日の表示と予定の詳細に変えた後のタイトルが出ること`, async ({
        browser,
      }) => {
        // 撮るたびに予定が増えるので、タイトルで今回の予定を見分ける
        const stamp = Date.now()
        const created = `会議 ${stamp}`
        const changed = `会議（場所を変更）${stamp}`
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-and-edit',
            title:
              '通常の予定を作ると日の表示に出て、タイトルを変えると予定の詳細に変えた後のタイトルが出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
            await expect(column).toBeVisible()
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、通常の予定を選ぶ')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-normal').check()

            await step(`タイトルに「${created}」を入れる`)
            await page.getByTestId('schedule-field-title').click()
            await page.getByTestId('schedule-form-title').fill(created)

            await step(`予定者に ${LOGIN_STAFF.name} を選び、作成する`)
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
            await page.getByTestId('schedule-create-submit').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
            const event = column.getByTestId(/^schedule-event-/).filter({ hasText: created })
            await expect(event).toBeVisible()
            await check(`日の表示の ${LOGIN_STAFF.name} の列に、作った予定が出る`)

            await step('作った予定を開き、「編集」を押す')
            await event.click()
            await expect(page.getByTestId('schedule-detail-modal')).toContainText(created)
            await page.getByTestId('schedule-detail-edit').click()

            await step(`タイトルを「${changed}」に変えて保存する`)
            await page.getByTestId('schedule-field-title').click()
            await page.getByTestId('schedule-form-title').fill(changed)
            await page.getByTestId('schedule-edit-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toContainText(changed)
            await check('予定の詳細に、変えた後のタイトルが出る')
          },
        )
      })
    }
  })
})
