import { expect, test } from '@playwright/test'

import { LOGIN_STAFF } from '../../fixtures/env'
import { registerPatient } from '../../fixtures/patient'
import {
  issueManagerToken,
  leaveStaff,
  retireStaff,
  setNonVisiting,
  STAFF_FORM,
} from '../../fixtures/staff'
import { registerStoppedStaff } from '../../setup/staff'
import { patientOptionByName } from '../../selectors/patientSelect'
import { newPatientName } from './names'

/** 休職か退職か、訪問しない職員（ADR-0006）にする操作。 */
const STOPS = [
  {
    label: '休職の職員',
    stop: leaveStaff,
    message: /^休職の職員 .+ には、予定と担当を割り振れません$/,
  },
  {
    label: '退職した職員',
    stop: retireStaff,
    message: /^退職した職員 .+ には、予定と担当を割り振れません$/,
  },
  {
    label: '訪問しない職員',
    stop: setNonVisiting,
    message: /^訪問しない職員 .+ には、予定と担当を割り振れません$/,
  },
] as const

test.describe('利用者の一覧', () => {
  test.describe('利用者の登録', () => {
    test('職員の管理の権限を持つ職員が利用者を登録した場合、利用者の一覧に出て、予定の作成の利用者の候補に出ること', async ({
      page,
    }) => {
      const name = newPatientName('patient')

      await page.goto('/patients')
      await page.getByTestId('patient-list-new').click()
      const dialog = page.getByTestId('patient-new-dialog')
      await dialog.getByTestId('patient-new-name').fill(name)
      await dialog.getByTestId('patient-new-service').selectOption({ index: 1 })
      await dialog.getByTestId('patient-new-time-afternoon').check()
      await dialog.getByTestId('patient-new-gender-male').check()
      await dialog.getByTestId('patient-new-staff').selectOption(LOGIN_STAFF.id)
      await dialog.getByTestId('patient-new-submit').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(name)

      await page.getByTestId('patient-detail-back').click()
      await page.getByTestId('patient-list-search').fill(name)
      await expect(page.getByTestId('patient-list-count')).toHaveText('1 人')
      const table = page.getByTestId('patient-list-table')
      await expect(table).toContainText(name)
      await expect(table).toContainText(LOGIN_STAFF.name)
      await expect(table).toContainText('午後')

      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await page.getByTestId('schedule-kind-tab-visit').check()
      await page.getByTestId('schedule-field-patient').click()
      await page.getByTestId('patient-select-search').fill(name)
      await expect(patientOptionByName(page, name)).toBeVisible()
    })
  })

  test.describe('休職と退職の職員と、訪問しない職員への割り振り', () => {
    for (const { label, stop, message } of STOPS) {
      test(`担当を${label}にして利用者を登録しようとした場合、400 が返ること`, async ({
        request,
      }) => {
        const manager = await issueManagerToken()
        const stopped = await registerStoppedStaff(request, manager, stop)

        const res = await registerPatient(request, manager, STAFF_FORM.facilityId, {
          name: `E2E 利用者 ${Date.now()}`,
          assignedStaffId: stopped.id,
        })

        expect(res.status()).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'invalid_input', message })
      })
    }
  })
})
