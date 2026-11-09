import { expect, test, type APIRequestContext } from '@playwright/test'

import { LEADER_STATE, LOGIN_STAFF } from '../../fixtures/env'
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

test.describe('利用者の一覧', () => {
  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が利用者の画面の URL を開いた場合、利用者の管理の画面が出ないこと', async ({
      page,
      request,
    }) => {
      const id = await registerPatientId(request, newPatientName('hidden'))

      for (const url of ['/patients', '/patients/new', `/patients/${id}`]) {
        await page.goto(url)
        await expect(page.getByTestId('page-forbidden')).toBeVisible()
        await expect(page.getByTestId('site-nav')).not.toContainText('利用者')
        await expect(page.getByTestId('patient-list-table')).toHaveCount(0)
        await expect(page.getByTestId('patient-new-dialog')).toHaveCount(0)
        await expect(page.getByTestId('patient-detail-name')).toHaveCount(0)
      }
    })
  })
})
