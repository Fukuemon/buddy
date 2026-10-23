import type { APIRequestContext } from '@playwright/test'

import { SCHEDULE_URL } from './env'

/** 予定の API のシードの 1 つ目の事業所と、職員を登録するときの部署、チーム、役職（メンバー）。 */
export const STAFF_FORM = {
  facilityId: '01M3TC5H00QV17BC0J9V3393ZP',
  departmentId: '01M3TC5HZ8A18D2TP3PTKDXJMN',
  teamId: '01M3TC5KXRSEVXQZ2MTJK9FS45',
  positionId: '01M3TC5QTRHSXHE7C68HPN6MBH',
}

/** 走らせるたびに違う職員を登録する。メールの @ の前は、上流の IdP のフェイクの sub にもなる。 */
export const newStaff = (label: string) => {
  const stamp = Date.now()
  return { email: `e2e.${label}.${stamp}@example.com`, name: `E2E ${label} ${stamp}` }
}

/** 予定の API の職員の登録（POST /v1/facilities/{facility_id}/users）を token の職員で呼び、レスポンスを返す。 */
export const registerStaff = (
  request: APIRequestContext,
  token: string,
  staff: { email: string; name: string },
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username: staff.name,
      email: staff.email,
      department_id: STAFF_FORM.departmentId,
      team_id: STAFF_FORM.teamId,
      position_id: STAFF_FORM.positionId,
    },
  })

/** 予定の API の職員の停止（POST /v1/users/{user_id}/suspend）を token の職員で呼び、レスポンスを返す。 */
export const suspendStaff = (request: APIRequestContext, token: string, userId: string) =>
  request.post(`${SCHEDULE_URL}/v1/users/${userId}/suspend`, {
    headers: { Authorization: `Bearer ${token}` },
  })

/** 予定の API の職員の一覧（GET /v1/facilities/{facility_id}/users）を token の職員で呼び、レスポンスを返す。 */
export const listStaff = (request: APIRequestContext, token: string, facilityId: string) =>
  request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
