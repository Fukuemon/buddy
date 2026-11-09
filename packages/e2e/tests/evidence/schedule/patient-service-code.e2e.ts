import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT, SEED_PATIENT_I3 } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 録画の外で、ログインし、今日の日の表示に、サービスコードが訪看I2 の利用者の訪問の予定を 1 件作っておく。 */
const createVisit = async (page: Page) => {
  await signIn(page)
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
  await page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`).check()
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

/** 日の表示を開き、予定の作成のダイアログで訪問の予定を選ぶ。 */
const openVisitCreate = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
}

test.describe('予定のカレンダー', () => {
  test.describe('利用者のサービスコードの初期値', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}予定の作成でサービスコードが訪看I3 の利用者を選んだ場合、サービスコードが訪看I3 になり、提供時間が訪看I3 の範囲の上限になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-patient-service-code',
            title:
              '予定の作成でサービスコードが訪看I3 の利用者を選ぶと、サービスコードが訪看I3 になり、提供時間が訪看I3 の範囲の上限の 59 分になる',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openVisitCreate(page)
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('service-code-訪看I2')).toBeChecked()
            await expect(page.getByTestId('schedule-form-service-time')).toHaveValue('29')
            await step(
              '予定の作成のダイアログで訪問の予定を選んでいる\n訪問日時は初期値の「訪看I2」、提供時間 29 分',
            )

            await step(`利用者を開き、サービスコードが訪看I3 の ${SEED_PATIENT_I3.name} を選ぶ`)
            await page.getByTestId('schedule-field-patient').click()
            await page.getByTestId(`patient-select-option-${SEED_PATIENT_I3.id}`).check()
            await expect(page.getByTestId('schedule-field-date-time')).toContainText(
              '（59 分、訪看I3）',
            )

            await step('訪問日時を開く')
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('service-code-訪看I3')).toBeChecked()
            await expect(page.getByTestId('service-code-訪看I2')).not.toBeChecked()
            await expect(page.getByTestId('schedule-form-service-time')).toHaveValue('59')
            await check(
              'サービスコードが「訪看I3」になり、提供時間（分）が訪看I3 の範囲（30 分から 59 分）の上限の 59 になる',
            )
          },
        )
      })

      test(`${prefix}予定の作成でサービスコードを手で選んだ後に利用者を選んだ場合、サービスコードと提供時間が手で選んだままであること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-manual-service-code-kept',
            title:
              '予定の作成でサービスコードを手で「訪看I4」に選んだ後に、サービスコードが訪看I3 の利用者を選んでも、サービスコードと提供時間が手で選んだままになる',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openVisitCreate(page)
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('service-code-訪看I2')).toBeChecked()
            await step('予定の作成のダイアログで訪問の予定を選び、訪問日時を開いている')

            await step('サービスコードの「訪看I4」を押す')
            await page.getByTestId('service-code-訪看I4').check()
            await expect(page.getByTestId('service-code-訪看I4')).toBeChecked()
            await expect(page.getByTestId('schedule-form-service-time')).toHaveValue('89')
            await check('サービスコードが「訪看I4」になり、提供時間（分）が 89 になる')

            await step(`利用者を開き、サービスコードが訪看I3 の ${SEED_PATIENT_I3.name} を選ぶ`)
            await page.getByTestId('schedule-field-patient').click()
            await page.getByTestId(`patient-select-option-${SEED_PATIENT_I3.id}`).check()
            await expect(
              page.getByTestId(`patient-select-option-${SEED_PATIENT_I3.id}`),
            ).toBeChecked()

            await step('訪問日時を開く')
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('service-code-訪看I4')).toBeChecked()
            await expect(page.getByTestId('service-code-訪看I3')).not.toBeChecked()
            await expect(page.getByTestId('schedule-form-service-time')).toHaveValue('89')
            await check(
              'サービスコードは手で選んだ「訪看I4」のまま、提供時間（分）は 89 のままになる',
            )
          },
        )
      })

      test(`${prefix}予定の編集で利用者を別の利用者に替えた場合、サービスコードが替えた後の利用者のコードになること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-edit-patient-service-code',
            title:
              '訪看I2 の訪問の予定の編集で、利用者をサービスコードが訪看I3 の利用者に替えると、サービスコードが訪看I3 になる',
            actor: ACTOR,
            variant,
          },
          createVisit,
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            const visit = page
              .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
              .first()
            await expect(visit).toBeVisible()
            await step(
              `予定のカレンダーの日の表示に、${SEED_PATIENT.name}（訪看I2）の訪問の予定がある`,
            )

            await step('訪問の予定を押し、「編集」を押す')
            await visit.click()
            await expect(page.getByTestId('schedule-detail-visit')).toContainText(SEED_PATIENT.name)
            await page.getByTestId('schedule-detail-edit').click()
            await expect(page.getByTestId('schedule-field-date-time')).toContainText('訪看I2')
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('service-code-訪看I2')).toBeChecked()
            await check('予定の編集が開き、サービスコードは予定の「訪看I2」になっている')

            await step(`利用者を開き、サービスコードが訪看I3 の ${SEED_PATIENT_I3.name} に替える`)
            await page.getByTestId('schedule-field-patient').click()
            await page.getByTestId(`patient-select-option-${SEED_PATIENT_I3.id}`).check()
            await expect(page.getByTestId('schedule-field-date-time')).toContainText(
              '（59 分、訪看I3）',
            )

            await step('訪問日時を開く')
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('service-code-訪看I3')).toBeChecked()
            await expect(page.getByTestId('service-code-訪看I2')).not.toBeChecked()
            await expect(page.getByTestId('schedule-form-service-time')).toHaveValue('59')
            await check(
              `サービスコードが、替えた後の ${SEED_PATIENT_I3.name} の「訪看I3」になり、提供時間（分）が 59 になる`,
            )
          },
        )
      })
    }
  })
})
