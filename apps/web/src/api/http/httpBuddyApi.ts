import createClient from 'openapi-fetch'

import { ApiError, type BuddyApi } from '../client'
import { matchesName } from '../nameSearch'
import type { paths } from '../generated/schedule'
import { expandRecurring, occurrenceOf, occurs, parseOccurrenceId } from './recurrence'
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
  /** リクエストを送る fetch。BFF はトークンを付ける fetch に替える。デフォルトは globalThis.fetch。 */
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
const unwrap = async <T>(promise: Promise<Result<T>>): Promise<T> => {
  const { data, error, response } = await promise
  if (!response.ok || data === undefined) throw apiError(error, response)
  return data
}

/** 本文の無い成功のレスポンスを待つ。失敗の状態なら ApiError を投げる。 */
const expectOk = async (promise: Promise<Result<unknown>>): Promise<void> => {
  const { error, response } = await promise
  if (!response.ok) throw apiError(error, response)
}

/**
 * 予定の API を openapi-fetch で呼ぶ BuddyApi を作る。トークンは付けない。
 *
 * schedules.list は、繰り返しの予定を期間の回に分け、occurrenceId の ID を持つ単発の予定として返す。
 * キャンセルした予定は、includeCancelled が true のときだけ cancel 付きで返す。
 * キャンセルした予定は画面で変換できなければ飛ばし、一覧の全体を失敗にしない。
 * schedules.get と schedules.update は、回の ID を受けると、繰り返しの予定のその回を読み、その回を置き換える。
 * schedules.update は、今の予定を読んでから置き換え、画面が持たない同行者などを keepCurrentVisit で引き継ぐ。
 * schedules.get は、ほかの事業所の予定を指すと status が 403 の ApiError を投げる。
 */
export const createHttpBuddyApi = ({ baseUrl, fetch }: HttpApiOptions): BuddyApi => {
  const client = createClient<paths>({ baseUrl, fetch })

  /** 回の ID が指す繰り返しの予定の回を読む。回が無ければ status が 404 の ApiError を投げる。 */
  const loadOccurrence = async (recurringId: string, date: string) => {
    const recurringSchedule = await unwrap(
      client.GET('/v1/schedules/recurring/{recurring_schedule_id}', {
        params: { path: { recurring_schedule_id: recurringId } },
      }),
    )
    if (!occurs(recurringSchedule, date) || recurringSchedule.exclusion_dates.includes(date)) {
      throw new ApiError(404, `繰り返しの予定の ${date} の回はありません`, [], 'not_found')
    }
    return occurrenceOf(recurringSchedule, date)
  }

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
      list: async (facilityId, { from, to, staffIds, includeCancelled }) => {
        const fromTime = Date.parse(from)
        const toTime = Date.parse(to)
        const dateFrom = splitDateTime(from).date
        const dateTo = splitDateTime(new Date(toTime - 1).toISOString()).date
        const { schedules, recurring_schedules: recurring } = await unwrap(
          client.GET('/v1/facilities/{facility_id}/schedules', {
            params: {
              path: { facility_id: facilityId },
              query: { date_from: dateFrom, date_to: dateTo },
            },
          }),
        )
        return [
          ...schedules,
          ...recurring.flatMap((recurringSchedule) =>
            expandRecurring(recurringSchedule, dateFrom, dateTo),
          ),
        ]
          .filter((schedule) => includeCancelled === true || schedule.cancel === null)
          .flatMap((schedule) => {
            if (schedule.cancel === null) return [fromApiSchedule(schedule)]
            // 昔のキャンセルした予定に、画面が知らないサービスコードが残っていることがある
            try {
              return [fromApiSchedule(schedule)]
            } catch {
              return []
            }
          })
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
        const occurrence = parseOccurrenceId(scheduleId)
        const schedule =
          occurrence !== undefined
            ? await loadOccurrence(occurrence.recurringId, occurrence.date)
            : await unwrap(
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
        const occurrence = parseOccurrenceId(scheduleId)
        if (occurrence !== undefined) {
          const [current, masters] = await Promise.all([
            loadOccurrence(occurrence.recurringId, occurrence.date),
            loadMasters(),
          ])
          const replaced = await unwrap(
            client.POST('/v1/schedules/recurring/{recurring_schedule_id}/occurrences', {
              params: { path: { recurring_schedule_id: occurrence.recurringId } },
              body: {
                ...keepCurrentVisit(toSlotRequest(input, masters), current),
                original_date: occurrence.date,
              },
            }),
          )
          return fromApiSchedule(replaced)
        }
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
      exportIssues: async (facilityId) => {
        const { items } = await unwrap(
          client.GET('/v1/facilities/{facility_id}/calendar_export_issues', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return items
      },
      retryExport: (_facilityId, exportId) =>
        unwrap(
          client.POST('/v1/calendar_exports/{calendar_export_id}/retries', {
            params: { path: { calendar_export_id: exportId } },
          }),
        ),
      acceptExport: (_facilityId, exportId) =>
        unwrap(
          client.POST('/v1/calendar_exports/{calendar_export_id}/acceptances', {
            params: { path: { calendar_export_id: exportId } },
          }),
        ),
    },
  }
}
