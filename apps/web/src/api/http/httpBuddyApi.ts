import createClient from 'openapi-fetch'

import { ApiError, type BuddyApi } from '../client'
import { matchesName } from '../nameSearch'
import type { paths } from '../generated/schedule'
import {
  fromApiPatient,
  fromApiSchedule,
  fromApiStaff,
  fromApiTeam,
  keepCurrentVisit,
  splitDateTime,
  toSlotRequest,
} from './scheduleMapper'

/** 予定の API を呼ぶ BuddyApi の設定。 */
export type HttpApiOptions = {
  /** API の URL。例は `http://localhost:8080`。 */
  baseUrl: string
  /** 要求を送る fetch。BFF はトークンを付ける fetch に替える。既定は globalThis.fetch。 */
  fetch?: typeof globalThis.fetch
}

type Result<T> = { data?: T; error?: unknown; response: Response }

/** openapi-fetch の失敗の結果を、API の Error の code と message を持つ ApiError にする。 */
const apiError = (error: unknown, response: Response) => {
  const body = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const message = 'message' in body ? String(body.message) : response.statusText
  const code = typeof body.code === 'string' ? body.code : undefined
  return new ApiError(response.status, message, [], code)
}

/** openapi-fetch の結果から data を取り出す。失敗の状態なら ApiError を投げる。 */
export const unwrap = async <T>(promise: Promise<Result<T>>): Promise<T> => {
  const { data, error, response } = await promise
  if (!response.ok || data === undefined) throw apiError(error, response)
  return data
}

/** 本文の無い成功の応答を待つ。失敗の状態なら ApiError を投げる。 */
const expectOk = async (promise: Promise<Result<unknown>>): Promise<void> => {
  const { error, response } = await promise
  if (!response.ok) throw apiError(error, response)
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
        return users.map(fromApiStaff).filter((staff) => matchesName(staff.name, params))
      },
    },
    teams: {
      list: async (facilityId) => {
        const teams = await unwrap(
          client.GET('/v1/facilities/{facility_id}/teams', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return teams.map(fromApiTeam)
      },
    },
    patients: {
      list: async (facilityId, params) => {
        const patients = await unwrap(
          client.GET('/v1/facilities/{facility_id}/patients', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return patients.map(fromApiPatient).filter((patient) => matchesName(patient.name, params))
      },
    },
    calendars: {
      serviceAccount: async (facilityId) => {
        const { email } = await unwrap(
          client.GET('/v1/facilities/{facility_id}/calendar_service_account', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return email
      },
      list: async (facilityId) => {
        const { items } = await unwrap(
          client.GET('/v1/facilities/{facility_id}/external_calendars', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return items
      },
      check: async (facilityId, calendarId) => {
        await unwrap(
          client.POST('/v1/facilities/{facility_id}/external_calendars/check', {
            params: { path: { facility_id: facilityId } },
            body: { calendar_id: calendarId },
          }),
        )
      },
      link: (facilityId, { staffId, calendarId }) =>
        unwrap(
          client.POST('/v1/facilities/{facility_id}/external_calendars', {
            params: { path: { facility_id: facilityId } },
            body: { staff_id: staffId, calendar_id: calendarId },
          }),
        ),
      unlink: (_facilityId, externalCalendarId) =>
        expectOk(
          client.DELETE('/v1/external_calendars/{external_calendar_id}', {
            params: { path: { external_calendar_id: externalCalendarId } },
          }),
        ),
      preview: (_facilityId, externalCalendarId, range) =>
        unwrap(
          client.POST('/v1/external_calendars/{external_calendar_id}/import_previews', {
            params: { path: { external_calendar_id: externalCalendarId } },
            body: range,
          }),
        ),
      import: (_facilityId, externalCalendarId, input) =>
        unwrap(
          client.POST('/v1/external_calendars/{external_calendar_id}/imports', {
            params: { path: { external_calendar_id: externalCalendarId } },
            body: input,
          }),
        ),
    },
  }
}
