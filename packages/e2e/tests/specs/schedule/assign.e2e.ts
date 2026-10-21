import { expect, test } from '@playwright/test'

import { LEADER, LEADER_STATE, SEED_PATIENT, TEAM_MEMBER } from '../../fixtures/env'

test.describe('予定のカレンダー', () => {
  test.describe('予定の割り振り', () => {
    test.describe('チームリーダー', () => {
      test.use({ storageState: LEADER_STATE })

      test('チームの職員に訪問の予定を作った場合、日の表示のその職員の列に訪問が 1 件増えること', async ({
        page,
      }) => {
        await page.goto('/schedule?view=day')
        await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
        await page.getByTestId('schedule-create-open').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
        await page.getByTestId('schedule-kind-tab-visit').check()
        await page.getByTestId('service-code-訪看I3').check()
        await page.getByTestId('schedule-field-patient').click()
        const patientOption = page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)
        // 利用者の一覧が届くまでは、カレンダーの訪問の題が「利用者不明 訪問」になるので、届いてから数える
        await expect(patientOption).toBeVisible()
        // 訪問の予定は題名を持たず、利用者の名前で出るので、作る前の件数と比べる
        const visits = page
          .getByTestId(`day-grid-staff-${TEAM_MEMBER.id}`)
          .getByTestId(/^schedule-event-/)
          .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
        const before = await visits.count()

        await patientOption.check()
        await page.getByTestId('schedule-field-staff').click()
        await page.getByTestId(`staff-select-option-${TEAM_MEMBER.id}`).check()
        await page.getByTestId('schedule-create-submit').click()

        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
        await expect(visits).toHaveCount(before + 1)
      })
    })
  })
})
