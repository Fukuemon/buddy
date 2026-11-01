import type { APIRequestContext } from '@playwright/test'

import { SCHEDULE_URL } from './env'
import { STAFF_FORM } from './staff'

/** 走らせるたびに違う名前の部署かチームにする。事業所の中で名前を重ねられないためである。 */
export const newUnitName = (label: string) => `E2E ${label} ${Date.now()}`

/** 予定の API のチームの作成（POST /v1/facilities/{facility_id}/teams）を token の職員で呼び、作ったチームの ID を返す。 */
export const createTeam = async (
  request: APIRequestContext,
  token: string,
  team: { name: string; color: string },
) => {
  const response = await request.post(
    `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/teams`,
    { headers: { Authorization: `Bearer ${token}` }, data: team },
  )
  if (!response.ok()) throw new Error(`チームを作れない: ${response.status()}`)
  const { id } = (await response.json()) as { id: string }
  return id
}

/** 予定の API の職員の変更（PUT /v1/users/{user_id}）を token の職員で呼び、職員をチーム teamId に移す。名前は変えず、訪問する職員のままにする。 */
export const moveStaffToTeam = async (
  request: APIRequestContext,
  token: string,
  staff: { id: string; name: string },
  teamId: string,
) => {
  const response = await request.put(`${SCHEDULE_URL}/v1/users/${staff.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { username: staff.name, department_id: STAFF_FORM.departmentId, team_id: teamId, visits: true },
  })
  if (!response.ok()) throw new Error(`職員をチームに移せない: ${response.status()}`)
}
