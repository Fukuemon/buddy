import { expect, type APIRequestContext } from '@playwright/test'

import { LOGIN_STAFF } from '../fixtures/env'
import { registerPatient } from '../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../fixtures/staff'

/** マネージャーで、担当を青木 陽菜にした利用者を登録し、ID を返す。名前は呼ぶ側が走らせるたびに変える。 */
export const registerPatientId = async (request: APIRequestContext, name: string) => {
  const res = await registerPatient(request, await issueManagerToken(), STAFF_FORM.facilityId, {
    name,
    assignedStaffId: LOGIN_STAFF.id,
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}
