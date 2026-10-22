import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_NAME, LOGIN_STAFF, SEED_PATIENT, TEAM_MEMBER } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtIdp } from '../../screens/login'

test.describe('予定のカレンダー', () => {
  test.describe('訪問の予定の作成', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}サービスコードを選んで訪問の予定を作った場合、日の表示の予定者の列に訪問が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-visit-create',
            title:
              'サービスコードを選んで訪問の予定を作ると、日の表示の予定者の列に訪問が 1 件増える',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtIdp(page, LOGIN_NAME)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
            await expect(column).toBeVisible()
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、訪問の予定を選ぶ')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()

            await step('サービスコードの「訪看I3」を押す')
            await page.getByTestId('service-code-訪看I3').check()
            await expect(page.getByTestId('service-code-訪看I3')).toBeChecked()
            await expect(page.getByTestId('service-code-訪看I2')).not.toBeChecked()
            await check('「訪看I3」が選ばれる')

            await step(
              `利用者に ${SEED_PATIENT.name}、予定者に ${LOGIN_STAFF.name} を選び、作成する`,
            )
            await page.getByTestId('schedule-field-patient').click()
            const patientOption = page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)
            // 利用者の一覧が届くまでは、訪問のタイトルが「利用者不明 訪問」になるので、届いてから数える
            await expect(patientOption).toBeVisible()
            const visits = column
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
            const before = await visits.count()
            await patientOption.check()
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
            await page.getByTestId('schedule-create-submit').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
            await expect(visits).toHaveCount(before + 1)
            await check(
              `日の表示の ${LOGIN_STAFF.name} の列に、${SEED_PATIENT.name} の訪問が 1 件増える`,
            )
          },
        )
      })

      test(`${variant.label ? `${variant.label}: ` : ''}チームリーダーがチームの職員に訪問の予定を作った場合、日の表示のその職員の列に訪問が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-visit-create-by-leader',
            title:
              'チームリーダーがチームの職員に訪問の予定を作ると、日の表示のその職員の列に訪問が 1 件増える',
            actor: `${LEADER.staff.name}（チームリーダー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtIdp(page, LEADER.loginName)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
            const column = page.getByTestId(`day-grid-staff-${TEAM_MEMBER.id}`)
            await expect(column).toBeVisible()
            await step(`${LEADER.staff.name} で入り、予定のカレンダーを日の表示で開いている`)

            await step('「予定を作成」を押し、訪問の予定で「訪看I3」を選ぶ')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('service-code-訪看I3').check()

            await step(
              `利用者に ${SEED_PATIENT.name}、予定者にチームの ${TEAM_MEMBER.name} を選び、作成する`,
            )
            await page.getByTestId('schedule-field-patient').click()
            const patientOption = page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)
            await expect(patientOption).toBeVisible()
            const visits = column
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
            const before = await visits.count()
            await patientOption.check()
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${TEAM_MEMBER.id}`).check()
            await page.getByTestId('schedule-create-submit').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
            await expect(visits).toHaveCount(before + 1)
            await check(
              `日の表示の ${TEAM_MEMBER.name} の列に、${SEED_PATIENT.name} の訪問が 1 件増える`,
            )
          },
        )
      })
    }
  })
})
