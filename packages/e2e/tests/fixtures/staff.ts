import type { APIRequestContext } from '@playwright/test'

import { issueAccessToken } from './apiReference'
import { LOGIN_EMAIL, SCHEDULE_URL } from './env'

/** 取り直すまでの時間。Hydra の access token の有効期間（5 分）より短くする。 */
const TOKEN_REUSE_MS = 4 * 60 * 1000

let managerToken: { value: string; issuedAt: number } | undefined

/**
 * マネージャー（LOGIN_EMAIL）の access token を返す。ブローカーはメールごとにログインの試行の回数を数えるので、
 * worker の中で 1 つを使い回し、TOKEN_REUSE_MS を過ぎたら取り直す。
 */
export const issueManagerToken = async (request: APIRequestContext) => {
  if (managerToken === undefined || Date.now() - managerToken.issuedAt > TOKEN_REUSE_MS) {
    managerToken = { value: await issueAccessToken(request, LOGIN_EMAIL), issuedAt: Date.now() }
  }
  return managerToken.value
}

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

/** 予定の API の職員の休職（POST /v1/users/{user_id}/leave）を token の職員で呼び、レスポンスを返す。 */
export const leaveStaff = (request: APIRequestContext, token: string, userId: string) =>
  request.post(`${SCHEDULE_URL}/v1/users/${userId}/leave`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  })

/** 予定の API の職員の復職（POST /v1/users/{user_id}/reinstate）を token の職員で呼び、レスポンスを返す。 */
export const reinstateStaff = (request: APIRequestContext, token: string, userId: string) =>
  request.post(`${SCHEDULE_URL}/v1/users/${userId}/reinstate`, {
    headers: { Authorization: `Bearer ${token}` },
  })

/** 予定の API の職員の退職（POST /v1/users/{user_id}/retire）を token の職員で呼び、レスポンスを返す。 */
export const retireStaff = (request: APIRequestContext, token: string, userId: string) =>
  request.post(`${SCHEDULE_URL}/v1/users/${userId}/retire`, {
    headers: { Authorization: `Bearer ${token}` },
  })

/** 予定の API の職員の一覧（GET /v1/facilities/{facility_id}/users）を token の職員で呼び、レスポンスを返す。 */
export const listStaff = (request: APIRequestContext, token: string, facilityId: string) =>
  request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })

/** 予定の API の役職、チーム、部署の一覧の 1 件。 */
export type NamedUnit = { id: string; name: string }

/** 予定の API の役職の一覧（GET /v1/facilities/{facility_id}/positions）を、役職に決まっている権限の code とともに返す。 */
export const listPositions = async (request: APIRequestContext, token: string) => {
  const res = await request.get(
    `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/positions`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  return (await res.json()) as (NamedUnit & { policies: { code: string }[] })[]
}

/** 予定の API の 1 つ目の事業所の、チームか部署の一覧を返す。 */
export const listUnits = async (
  request: APIRequestContext,
  token: string,
  kind: 'teams' | 'departments',
) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/${kind}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return (await res.json()) as NamedUnit[]
}

/** 職員を登録し、登録した職員の ID を返す。登録できなければ Error を投げる。 */
export const registerStaffId = async (
  request: APIRequestContext,
  token: string,
  staff: { email: string; name: string },
) => {
  const res = await registerStaff(request, token, staff)
  if (res.status() !== 201) throw new Error(`職員を登録できなかった: ${res.status()}`)
  return ((await res.json()) as { id: string }).id
}
