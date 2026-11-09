import { expect, test, type APIRequestContext } from '@playwright/test'

import { LEADER, LOGIN_STAFF } from '../../fixtures/env'
import { registerPatient } from '../../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { newPatientName } from './names'

/** マネージャーで、担当を青木 陽菜にした利用者を登録し、ID を返す。 */
const registerPatientId = async (request: APIRequestContext, name: string) => {
  const res = await registerPatient(request, await issueManagerToken(), STAFF_FORM.facilityId, {
    name,
    assignedStaffId: LOGIN_STAFF.id,
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

test.describe('利用者の詳細', () => {
  test.describe('利用者の編集', () => {
    test('利用者の名前、サービス、希望、担当の職員を変えた場合、一覧に変えた値が出ること', async ({
      page,
      request,
    }) => {
      const name = newPatientName('edited')
      const id = await registerPatientId(request, name)

      await page.goto(`/patients/${id}`)
      await page.getByTestId('patient-detail-edit').click()
      const dialog = page.getByTestId('patient-detail-edit-dialog')
      await dialog.getByTestId('patient-detail-name-input').fill(`${name} 改`)
      await dialog
        .getByTestId('patient-detail-service-input')
        .selectOption({ label: '訪看I3（30〜59 分）' })
      await dialog.getByTestId('patient-detail-time-input-afternoon').check()
      await dialog.getByTestId('patient-detail-gender-input-male').check()
      await dialog.getByTestId('patient-detail-staff-input').selectOption(LEADER.staff.id)
      await dialog.getByTestId('patient-detail-save').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(`${name} 改`)

      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(`${name} 改`)
      const row = page.getByTestId(`patient-list-row-${id}`)
      await expect(row).toContainText(`${name} 改`)
      await expect(row).toContainText(LEADER.staff.name)
      await expect(row).toContainText('午後')
      await expect(row).toContainText('男性')
    })
  })
})
