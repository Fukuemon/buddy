import { expect, test, type APIRequestContext } from '@playwright/test'

import { LOGIN_STAFF } from '../../fixtures/env'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { newPatientName } from './names'

/** マネージャーで、担当を青木 陽菜にした利用者を登録し、ID を返す。 */
const registerPatientId = async (request: APIRequestContext, name: string) => {
  const res = await registerPatient(
    request,
    await issueManagerToken(request),
    STAFF_FORM.facilityId,
    {
      name,
      assignedStaffId: LOGIN_STAFF.id,
    },
  )
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

test.describe('利用者の詳細', () => {
  test.describe('利用の終了', () => {
    test('利用者の利用を終了した場合、一覧のデフォルトの表示と予定の作成の利用者の候補に出ないこと', async ({
      page,
      request,
    }) => {
      const name = newPatientName('ended')
      const id = await registerPatientId(request, name)

      await page.goto(`/patients/${id}`)
      await page.getByTestId('patient-detail-menu').click()
      await page.getByTestId('patient-detail-end').click()
      const dialog = page.getByTestId('patient-end-dialog')
      await expect(dialog).toContainText(`${name} の利用を終了しますか`)
      await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
        '今日以降の予定は残っていません。',
      )
      await dialog.getByTestId('patient-end-submit').click()
      await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')

      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(name)
      await expect(page.getByTestId('patient-list-empty')).toBeVisible()
      await page.getByTestId('patient-list-filter-status').selectOption('ended')
      await expect(page.getByTestId(`patient-list-row-${id}`)).toBeVisible()

      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await page.getByTestId('schedule-kind-tab-visit').check()
      await page.getByTestId('schedule-field-patient').click()
      await expect(page.getByTestId(/^patient-select-option-/).first()).toBeVisible()
      await expect(page.getByTestId(`patient-select-option-${id}`)).toHaveCount(0)
    })
  })

  test.describe('利用の再開', () => {
    test('利用の終了の利用者の利用を再開した場合、一覧のデフォルトの表示に戻ること', async ({
      page,
      request,
    }) => {
      const name = newPatientName('resumed')
      const id = await registerPatientId(request, name)
      expect(
        (await endPatientService(request, await issueManagerToken(request), id)).status(),
      ).toBe(200)

      await page.goto(`/patients/${id}`)
      await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
      await page.getByTestId('patient-detail-menu').click()
      await page.getByTestId('patient-detail-resume').click()
      const dialog = page.getByTestId('patient-resume-dialog')
      await expect(dialog.getByTestId('patient-resume-staff')).toHaveValue(LOGIN_STAFF.id)
      await dialog.getByTestId('patient-resume-submit').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('patient-detail-status')).toHaveCount(0)

      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(name)
      await expect(page.getByTestId(`patient-list-row-${id}`)).toBeVisible()
    })
  })
})
