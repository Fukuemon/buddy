import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, SEED_PATIENT } from '../../fixtures/env'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'

/** 利用を終了する利用者の名前。 */
const ENDED_PATIENT = '終了 花子'

test.describe('予定のカレンダー', () => {
  test.describe(`予定の作成の利用者の候補（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-ended-patient-candidates 利用の終了の利用者がいる場合、予定の作成の利用者の候補にその利用者が出ないこと', async ({
      browser,
      context,
    }) => {
      const endedId = await prepareOutsideRecording(
        browser,
        { storageState: LOGIN_STATE },
        async (page) => {
          const token = await issueManagerToken()
          const registered = await registerPatient(page.request, token, STAFF_FORM.facilityId, {
            name: ENDED_PATIENT,
            assignedStaffId: LOGIN_STAFF.id,
          })
          expect(registered.status()).toBe(201)
          const { id } = (await registered.json()) as { id: string }
          expect((await endPatientService(page.request, token, id)).status()).toBe(200)
          return id
        },
      )

      const page = await context.newPage()
      const endedOption = page.getByTestId(`patient-select-option-${endedId}`)
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await intro(
        page,
        `利用の終了の利用者は、予定の作成の利用者の候補に出ず、名前で検索しても出ない\n前提 利用者の ${ENDED_PATIENT} を、API で利用の終了にしてある`,
      )

      await step(page, '「予定を作成」を押し、訪問の予定の利用者の候補を開く', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-visit').check()
        await page.getByTestId('schedule-field-patient').click()
      })
      await check(
        page,
        `候補に利用中の ${SEED_PATIENT.name} が出て、${ENDED_PATIENT} は出ない`,
        async () => {
          await expect(page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)).toBeVisible()
          await expect(endedOption).toHaveCount(0)
        },
      )

      await step(page, `利用者の検索に「${ENDED_PATIENT}」を入れる`, () =>
        page.getByTestId('patient-select-search').fill(ENDED_PATIENT),
      )
      await check(page, `名前で検索しても、${ENDED_PATIENT} は候補に出ない`, async () => {
        await expect(page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)).toBeHidden()
        await expect(endedOption).toHaveCount(0)
      })
    })
  })
})
