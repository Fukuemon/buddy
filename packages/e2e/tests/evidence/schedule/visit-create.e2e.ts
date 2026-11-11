import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import {
  LEADER,
  LEADER_STATE,
  LOGIN_STAFF,
  LOGIN_STATE,
  SEED_PATIENT,
  TEAM_MEMBER,
} from '../../fixtures/env'

test.describe('予定のカレンダー', () => {
  test.describe(`訪問の予定の作成（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-visit-create サービスコードを選んで訪問の予定を作った場合、日の表示の予定者の列に訪問が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
      await expect(column).toBeVisible()
      await intro(
        page,
        'サービスコードを選んで訪問の予定を作ると、日の表示の予定者の列に訪問が 1 件増える\n前提 予定のカレンダーを日の表示で開いている',
      )

      await step(page, '「予定を作成」を押し、訪問の予定を選ぶ', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-visit').check()
      })

      await step(page, 'サービスコードの「訪看I3」を押す', () =>
        page.getByTestId('service-code-訪看I3').check(),
      )
      await check(page, '「訪看I3」が選ばれる', async () => {
        await expect(page.getByTestId('service-code-訪看I3')).toBeChecked()
        await expect(page.getByTestId('service-code-訪看I2')).not.toBeChecked()
      })

      const visits = column
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
      let before = 0
      await step(
        page,
        `利用者に ${SEED_PATIENT.name}、予定者に ${LOGIN_STAFF.name} を選び、作成する`,
        async () => {
          await page.getByTestId('schedule-field-patient').click()
          const patientOption = page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)
          // 利用者の一覧が届くまでは、訪問のタイトルが「利用者不明 訪問」になるので、届いてから数える
          await expect(patientOption).toBeVisible()
          before = await visits.count()
          await patientOption.check()
          await page.getByTestId('schedule-field-staff').click()
          await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
          await page.getByTestId('schedule-create-submit').click()
        },
      )
      await check(
        page,
        `日の表示の ${LOGIN_STAFF.name} の列に、${SEED_PATIENT.name} の訪問が 1 件増える`,
        async () => {
          await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
          await expect(visits).toHaveCount(before + 1)
        },
      )
    })
  })

  test.describe(`訪問の予定の作成（${LEADER.staff.name}、チームリーダー）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('schedule-visit-create-by-leader チームリーダーがチームの職員に訪問の予定を作った場合、日の表示のその職員の列に訪問が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
      const column = page.getByTestId(`day-grid-staff-${TEAM_MEMBER.id}`)
      await expect(column).toBeVisible()
      await intro(
        page,
        `チームリーダーがチームの職員に訪問の予定を作ると、日の表示のその職員の列に訪問が 1 件増える\n前提 ${LEADER.staff.name} で入り、予定のカレンダーを日の表示で開いている`,
      )

      await step(page, '「予定を作成」を押し、訪問の予定で「訪看I3」を選ぶ', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-visit').check()
        await page.getByTestId('service-code-訪看I3').check()
      })

      const visits = column
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
      let before = 0
      await step(
        page,
        `利用者に ${SEED_PATIENT.name}、予定者にチームの ${TEAM_MEMBER.name} を選び、作成する`,
        async () => {
          await page.getByTestId('schedule-field-patient').click()
          const patientOption = page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)
          await expect(patientOption).toBeVisible()
          before = await visits.count()
          await patientOption.check()
          await page.getByTestId('schedule-field-staff').click()
          await page.getByTestId(`staff-select-option-${TEAM_MEMBER.id}`).check()
          await page.getByTestId('schedule-create-submit').click()
        },
      )
      await check(
        page,
        `日の表示の ${TEAM_MEMBER.name} の列に、${SEED_PATIENT.name} の訪問が 1 件増える`,
        async () => {
          await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
          await expect(visits).toHaveCount(before + 1)
        },
      )
    })
  })
})
