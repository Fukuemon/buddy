import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

/** 利用の終了にする利用者の名前。 */
const ENDED_PATIENT = '終了 花子'

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成の利用者の候補', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}利用の終了の利用者がいる場合、予定の作成の利用者の候補にその利用者が出ないこと`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-ended-patient-candidates',
            title: '利用の終了の利用者は、予定の作成の利用者の候補に出ず、名前で検索しても出ない',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            const token = await issueManagerToken(request)
            const registered = await registerPatient(request, token, STAFF_FORM.facilityId, {
              name: ENDED_PATIENT,
              assignedStaffId: LOGIN_STAFF.id,
            })
            expect(registered.status()).toBe(201)
            const { id } = (await registered.json()) as { id: string }
            expect((await endPatientService(request, token, id)).status()).toBe(200)
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
            return id
          },
          async ({ page, step, check }, endedId) => {
            const endedOption = page.getByTestId(`patient-select-option-${endedId}`)
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await step(`利用者の ${ENDED_PATIENT} を、API で利用の終了にしてある`)

            await step('「予定を作成」を押し、訪問の予定の利用者の候補を開く')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-patient').click()
            await expect(page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)).toBeVisible()
            await expect(endedOption).toHaveCount(0)
            await check(`候補に利用中の ${SEED_PATIENT.name} が出て、${ENDED_PATIENT} は出ない`)

            await step(`利用者の検索に「${ENDED_PATIENT}」を入れる`)
            await page.getByTestId('patient-select-search').fill(ENDED_PATIENT)
            await expect(page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`)).toBeHidden()
            await expect(endedOption).toHaveCount(0)
            await check(`名前で検索しても、${ENDED_PATIENT} は候補に出ない`)
          },
        )
      })
    }
  })
})
