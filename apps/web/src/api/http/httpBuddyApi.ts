import createClient from 'openapi-fetch'

import { ApiError, type BuddyApi } from '../client'
import { matchesName } from '../nameSearch'
import type { paths } from '../generated/schedule'
import { fromApiSchedule, keepCurrentVisit, splitDateTime, toSlotRequest } from './scheduleMapper'

export type HttpApiOptions = {
  /** API の URL。例は `http://localhost:8080`。 */
  baseUrl: string
  /** 要求を送る fetch。BFF はトークンを付ける fetch に替える。既定は globalThis.fetch。 */
  fetch?: typeof globalThis.fetch
}

type Result<T> = { data?: T; error?: unknown; response: Response }

/** openapi-fetch の結果から data を取り出す。失敗の状態なら ApiError を投げる。 */
export const unwrap = async <T>(promise: Promise<Result<T>>): Promise<T> => {
  const { data, error, response } = await promise
  if (!response.ok || data === undefined) {
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : response.statusText
    throw new ApiError(response.status, message)
  }
  return data
}

/**
 * 予定の API を openapi-fetch で呼ぶ BuddyApi を作る。トークンは付けない。
 *
 * schedules.update は、今の予定を読んでから置き換え、画面が持たない同行者などを keepCurrentVisit で引き継ぐ。
 * schedules.get は、ほかの事業所の予定を指すと status が 403 の ApiError を投げる。
 * schedules.list は、キャンセルした予定を返さない。画面の予定はキャンセルの状態を持たないため。
 */
export const createHttpBuddyApi = ({ baseUrl, fetch }: HttpApiOptions): BuddyApi => {
  const client = createClient<paths>({ baseUrl, fetch })

  const loadMasters = async () => {
    const [scheduleTypes, serviceCodes, visitCategories] = await Promise.all([
      unwrap(client.GET('/v1/schedule_types')),
      unwrap(client.GET('/v1/visit_infos/service_codes')),
      unwrap(client.GET('/v1/visit_infos/visit_categories')),
    ])
    return { scheduleTypes, serviceCodes, visitCategories }
  }

  return {
    schedules: {
      list: async (facilityId, { from, to, staffIds }) => {
        const fromTime = Date.parse(from)
        const toTime = Date.parse(to)
        const { schedules } = await unwrap(
          client.GET('/v1/facilities/{facility_id}/schedules', {
            params: {
              path: { facility_id: facilityId },
              query: {
                date_from: splitDateTime(from).date,
                date_to: splitDateTime(new Date(toTime - 1).toISOString()).date,
              },
            },
          }),
        )
        // shortcut: 繰り返しの予定（recurring_schedules）は回に展開していないので出さない。展開は予定の API の後半の作業で決める。
        return schedules
          .filter((schedule) => schedule.cancel === null)
          .map(fromApiSchedule)
          .filter(
            (schedule) =>
              Date.parse(schedule.endsAt) > fromTime &&
              Date.parse(schedule.startsAt) < toTime &&
              (staffIds === undefined ||
                staffIds.length === 0 ||
                staffIds.includes(schedule.staffId)),
          )
      },
      get: async (facilityId, scheduleId) => {
        const schedule = await unwrap(
          client.GET('/v1/schedules/{schedule_id}', {
            params: { path: { schedule_id: scheduleId } },
          }),
        )
        if (schedule.facility_id !== facilityId) {
          throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
        }
        return fromApiSchedule(schedule)
      },
      create: async (facilityId, input) => {
        const body = toSlotRequest(input, await loadMasters())
        const created = await unwrap(
          client.POST('/v1/facilities/{facility_id}/schedules', {
            params: { path: { facility_id: facilityId } },
            body,
          }),
        )
        return fromApiSchedule(created)
      },
      update: async (_facilityId, scheduleId, input) => {
        const [current, masters] = await Promise.all([
          unwrap(
            client.GET('/v1/schedules/{schedule_id}', {
              params: { path: { schedule_id: scheduleId } },
            }),
          ),
          loadMasters(),
        ])
        const body = keepCurrentVisit(toSlotRequest(input, masters), current)
        const updated = await unwrap(
          client.PUT('/v1/schedules/{schedule_id}', {
            params: { path: { schedule_id: scheduleId } },
            body,
          }),
        )
        return fromApiSchedule(updated)
      },
    },
    staff: {
      list: async (facilityId, params) => {
        const users = await unwrap(
          client.GET('/v1/facilities/{facility_id}/users', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        // API の username と name は完全一致なので、全件を取って部分一致で絞る
        return users
          .map((user) => ({ id: user.id, name: user.username, teamId: user.team.id }))
          .filter((staff) => matchesName(staff.name, params))
      },
    },
    teams: {
      list: async (facilityId) => {
        const teams = await unwrap(
          client.GET('/v1/facilities/{facility_id}/teams', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return teams.map((team) => ({ id: team.id, name: team.name }))
      },
    },
    patients: {
      list: async (facilityId, params) => {
        const patients = await unwrap(
          client.GET('/v1/facilities/{facility_id}/patients', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return patients
          .map((patient) => ({ id: patient.id, name: patient.name }))
          .filter((patient) => matchesName(patient.name, params))
      },
    },
  }
}
