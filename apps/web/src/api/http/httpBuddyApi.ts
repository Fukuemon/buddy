import createClient from 'openapi-fetch'

import { ApiError, type BuddyApi } from '../BuddyApi'
import { matchesName } from '../nameSearch'
import type { paths } from '../generated/schedule'
import {
  expandRecurring,
  occurrenceOf,
  occurs,
  parseOccurrenceId,
  previousDate,
} from './recurrence'
import {
  fromApiFacility,
  fromApiPatient,
  fromApiSchedule,
  fromApiStaff,
  fromApiTeam,
  keepCurrentVisit,
  splitDateTime,
  toApiRecurringRule,
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
 * 確認が必要な予定（needsReview）は期間で絞らず、職員の絞り込みだけを当てる。同期の状況も職員で絞る。
 * キャンセルした予定は、includeCancelled が true のときだけ cancel 付きで返す。
 * キャンセルした予定は画面で変換できなければ飛ばし、一覧の全体を失敗にしない。
 * schedules.get と schedules.update は、回の ID を受けると、繰り返しの予定のその回を読み、その回を置き換える。
 * schedules.cancel は、回の ID を受けると、繰り返しの予定のその回をキャンセルする。
 * schedules.update は、今の予定を読んでから置き換え、画面が持たない同行者などを keepCurrentVisit で引き継ぐ。
 * etag は、画面が予定を読んだときの値を送り、今の予定を読み直した値は送らない。読んだ後の Google カレンダーでの変更を見落とさないためである。
 * schedules.create は、画面が決めた id を送る。
 * schedules.get は、ほかの事業所の予定を指すと status が 403 の ApiError を投げる。
 */
export const createHttpBuddyApi = ({ baseUrl, fetch }: HttpApiOptions): BuddyApi => {
  const client = createClient<paths>({ baseUrl, fetch })

  /** 回の ID が指す繰り返しの予定の回を読む。回が無ければ status が 404 の ApiError を投げる。 */
  const getOccurrence = async (recurringId: string, date: string) => {
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

  const listMasters = async () => {
    const [scheduleTypes, serviceCodes, visitCategories] = await Promise.all([
      unwrap(client.GET('/v1/schedule_types')),
      unwrap(client.GET('/v1/visit_infos/service_codes')),
      unwrap(client.GET('/v1/visit_infos/visit_categories')),
    ])
    return { scheduleTypes, serviceCodes, visitCategories }
  }

  return {
    facilities: {
      get: async (facilityId) =>
        fromApiFacility(
          await unwrap(
            client.GET('/v1/facilities/{facility_id}', {
              params: { path: { facility_id: facilityId } },
            }),
          ),
        ),
    },
    me: {
      get: async (facilityId) => {
        const me = await unwrap(client.GET('/v1/me'))
        if (me.facility_id !== facilityId) {
          throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
        }
        return me
      },
      externalCalendar: async (facilityId) => {
        const { external_calendar } = await unwrap(client.GET('/v1/me/external_calendar'))
        if (external_calendar !== null && external_calendar.facility_id !== facilityId) {
          throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
        }
        return external_calendar
      },
    },
    schedules: {
      list: async (facilityId, { from, to, staffIds, includeCancelled }) => {
        const fromTime = Date.parse(from)
        const toTime = Date.parse(to)
        const dateFrom = splitDateTime(from).date
        const dateTo = splitDateTime(new Date(toTime - 1).toISOString()).date
        const {
          schedules,
          recurring_schedules: recurring,
          source_mode: sourceMode,
          calendar_syncs: calendarSyncs,
          cutover,
        } = await unwrap(
          client.GET('/v1/facilities/{facility_id}/schedules', {
            params: {
              path: { facility_id: facilityId },
              query: { date_from: dateFrom, date_to: dateTo },
            },
          }),
        )
        const isSelectedStaff = (staffId: string) =>
          staffIds === undefined || staffIds.length === 0 || staffIds.includes(staffId)
        const all = [
          ...schedules,
          ...recurring.flatMap((recurringSchedule) =>
            expandRecurring(
              recurringSchedule,
              recurringSchedule.ends_next_day ? previousDate(dateFrom) : dateFrom,
              dateTo,
            ),
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
          .filter((schedule) => isSelectedStaff(schedule.staffId))
        return {
          schedules: all.filter(
            (schedule) =>
              Date.parse(schedule.endsAt) > fromTime && Date.parse(schedule.startsAt) < toTime,
          ),
          // 繰り返しの規則を写せない予定は最初の回の日時で返り、期間の外のことがあるので、期間で絞らない
          needsReview: all.filter((schedule) => schedule.reviewReason !== undefined),
          sourceMode,
          calendarSyncs: calendarSyncs.filter((sync) => isSelectedStaff(sync.staff_id)),
          cutover,
        }
      },
      get: async (facilityId, scheduleId) => {
        const occurrence = parseOccurrenceId(scheduleId)
        const schedule =
          occurrence !== undefined
            ? await getOccurrence(occurrence.recurringId, occurrence.date)
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
      create: async (facilityId, input, id) => {
        const body = { ...toSlotRequest(input, await listMasters()), id }
        const created = await unwrap(
          client.POST('/v1/facilities/{facility_id}/schedules', {
            params: { path: { facility_id: facilityId } },
            body,
          }),
        )
        return fromApiSchedule(created)
      },
      update: async (_facilityId, scheduleId, input, etag) => {
        const occurrence = parseOccurrenceId(scheduleId)
        if (occurrence !== undefined) {
          const [current, masters] = await Promise.all([
            getOccurrence(occurrence.recurringId, occurrence.date),
            listMasters(),
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
          listMasters(),
        ])
        const body = keepCurrentVisit(toSlotRequest(input, masters), current)
        const updated = await unwrap(
          client.PUT('/v1/schedules/{schedule_id}', {
            params: { path: { schedule_id: scheduleId } },
            body: etag === null ? body : { ...body, etag },
          }),
        )
        return fromApiSchedule(updated)
      },
      cancel: async (_facilityId, scheduleId, reason, etag) => {
        const occurrence = parseOccurrenceId(scheduleId)
        if (occurrence !== undefined) {
          await unwrap(
            client.POST('/v1/schedules/recurring/{recurring_schedule_id}/occurrences/cancel', {
              params: { path: { recurring_schedule_id: occurrence.recurringId } },
              body: { original_date: occurrence.date, reason },
            }),
          )
          return
        }
        await unwrap(
          client.POST('/v1/schedules/{schedule_id}/cancel', {
            params: { path: { schedule_id: scheduleId } },
            body: etag === null ? { reason } : { reason, etag },
          }),
        )
      },
      changeRule: async (_facilityId, recurringScheduleId, { effectiveDate, rule, id }, etag) => {
        const body = {
          effective_date: effectiveDate,
          recurring_rule: toApiRecurringRule(rule),
          id,
        }
        const changed = await unwrap(
          client.PUT('/v1/schedules/recurring/{recurring_schedule_id}/rule', {
            params: { path: { recurring_schedule_id: recurringScheduleId } },
            body: etag === null ? body : { ...body, etag },
          }),
        )
        return { id: changed.id, date: changed.date }
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
      listRecords: (facilityId) =>
        unwrap(
          client.GET('/v1/facilities/{facility_id}/users', {
            params: {
              path: { facility_id: facilityId },
              query: { sort_field: 'username', sort_order: 'asc' },
            },
          }),
        ),
      get: async (facilityId, staffId) => {
        const staff = await unwrap(
          client.GET('/v1/users/{user_id}', { params: { path: { user_id: staffId } } }),
        )
        if (staff.facility_id !== facilityId) {
          throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
        }
        return staff
      },
      create: (facilityId, input) =>
        unwrap(
          client.POST('/v1/facilities/{facility_id}/users', {
            params: { path: { facility_id: facilityId } },
            body: input,
          }),
        ),
      update: async (_facilityId, staffId, input) => {
        const { data, error, response } = await client.PUT('/v1/users/{user_id}', {
          params: { path: { user_id: staffId } },
          body: input,
        })
        if (response.ok && data !== undefined) return { updated: data }
        if (error !== undefined && 'assignments' in error && error.assignments !== undefined) {
          return { assignments: error.assignments }
        }
        throw apiError(error, response)
      },
      changePosition: (_facilityId, staffId, positionId) =>
        unwrap(
          client.PUT('/v1/users/{user_id}/position', {
            params: { path: { user_id: staffId } },
            body: { position_id: positionId },
          }),
        ),
      addPolicy: (_facilityId, staffId, input) =>
        unwrap(
          client.POST('/v1/users/{user_id}/policies', {
            params: { path: { user_id: staffId } },
            body: input,
          }),
        ),
      removePolicy: (_facilityId, staffId, userPolicyId) =>
        unwrap(
          client.DELETE('/v1/users/{user_id}/policies/{user_policy_id}', {
            params: { path: { user_id: staffId, user_policy_id: userPolicyId } },
          }),
        ),
      remainingAssignments: (_facilityId, staffId) =>
        unwrap(
          client.GET('/v1/users/{user_id}/remaining_assignments', {
            params: { path: { user_id: staffId } },
          }),
        ),
      startLeave: async (_facilityId, staffId, returnDate) => {
        const { staff } = await unwrap(
          client.POST('/v1/users/{user_id}/leave', {
            params: { path: { user_id: staffId } },
            body: { return_date: returnDate },
          }),
        )
        return staff
      },
      reinstate: (_facilityId, staffId) =>
        unwrap(
          client.POST('/v1/users/{user_id}/reinstate', {
            params: { path: { user_id: staffId } },
          }),
        ),
      retire: async (_facilityId, staffId) => {
        const { data, error, response } = await client.POST('/v1/users/{user_id}/retire', {
          params: { path: { user_id: staffId } },
        })
        if (response.ok && data !== undefined) return { retired: data.staff }
        if (error !== undefined && 'assignments' in error && error.assignments !== undefined) {
          return { assignments: error.assignments }
        }
        throw apiError(error, response)
      },
    },
    departments: {
      list: async (facilityId) => {
        const departments = await unwrap(
          client.GET('/v1/facilities/{facility_id}/departments', {
            params: { path: { facility_id: facilityId } },
          }),
        )
        return departments.map(({ id, name }) => ({ id, name }))
      },
      create: async (facilityId, name) => {
        const department = await unwrap(
          client.POST('/v1/facilities/{facility_id}/departments', {
            params: { path: { facility_id: facilityId } },
            body: { name },
          }),
        )
        return { id: department.id, name: department.name }
      },
      update: async (_facilityId, departmentId, name) => {
        const department = await unwrap(
          client.PUT('/v1/departments/{department_id}', {
            params: { path: { department_id: departmentId } },
            body: { name },
          }),
        )
        return { id: department.id, name: department.name }
      },
    },
    positions: {
      list: (facilityId) =>
        unwrap(
          client.GET('/v1/facilities/{facility_id}/positions', {
            params: { path: { facility_id: facilityId } },
          }),
        ),
    },
    policies: {
      list: () => unwrap(client.GET('/v1/policies')),
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
      create: async (facilityId, input) =>
        fromApiTeam(
          await unwrap(
            client.POST('/v1/facilities/{facility_id}/teams', {
              params: { path: { facility_id: facilityId } },
              body: input,
            }),
          ),
        ),
      update: async (_facilityId, teamId, input) =>
        fromApiTeam(
          await unwrap(
            client.PUT('/v1/teams/{team_id}', {
              params: { path: { team_id: teamId } },
              body: input,
            }),
          ),
        ),
    },
    patients: {
      list: async (facilityId, params) => {
        const patients = await unwrap(
          client.GET('/v1/facilities/{facility_id}/patients', {
            params: { path: { facility_id: facilityId }, query: { include_ended: true } },
          }),
        )
        return patients.map(fromApiPatient).filter((patient) => matchesName(patient.name, params))
      },
      listRecords: (facilityId) =>
        unwrap(
          client.GET('/v1/facilities/{facility_id}/patients', {
            params: {
              path: { facility_id: facilityId },
              query: { include_ended: true, sort_field: 'name', sort_order: 'asc' },
            },
          }),
        ),
      get: async (facilityId, patientId) => {
        const patient = await unwrap(
          client.GET('/v1/patients/{patient_id}', {
            params: { path: { patient_id: patientId } },
          }),
        )
        if (patient.facility_id !== facilityId) {
          throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
        }
        return patient
      },
      create: (facilityId, input) =>
        unwrap(
          client.POST('/v1/facilities/{facility_id}/patients', {
            params: { path: { facility_id: facilityId } },
            body: input,
          }),
        ),
      update: (_facilityId, patientId, input) =>
        unwrap(
          client.PUT('/v1/patients/{patient_id}', {
            params: { path: { patient_id: patientId } },
            body: input,
          }),
        ),
      remainingSchedules: (_facilityId, patientId) =>
        unwrap(
          client.GET('/v1/patients/{patient_id}/remaining_schedules', {
            params: { path: { patient_id: patientId } },
          }),
        ),
      endService: async (_facilityId, patientId) => {
        const { data, error, response } = await client.POST(
          '/v1/patients/{patient_id}/end_service',
          {
            params: { path: { patient_id: patientId } },
          },
        )
        if (response.ok && data !== undefined) return { ended: data }
        if (error !== undefined && 'schedules' in error && error.schedules !== undefined) {
          return { schedules: error.schedules }
        }
        throw apiError(error, response)
      },
      resumeService: (_facilityId, patientId, assignedStaffId) =>
        unwrap(
          client.POST('/v1/patients/{patient_id}/resume_service', {
            params: { path: { patient_id: patientId } },
            body: { assigned_staff_id: assignedStaffId },
          }),
        ),
    },
    serviceCodes: {
      list: () => unwrap(client.GET('/v1/visit_infos/service_codes')),
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
      cutoverStatus: (facilityId) =>
        unwrap(
          client.GET('/v1/facilities/{facility_id}/calendar_cutover_status', {
            params: { path: { facility_id: facilityId } },
          }),
        ),
      startCutover: (facilityId) =>
        unwrap(
          client.POST('/v1/facilities/{facility_id}/calendar_cutovers', {
            params: { path: { facility_id: facilityId } },
          }),
        ),
      completeCutover: async (_facilityId, cutoverId) => {
        const { data, error, response } = await client.POST(
          '/v1/calendar_cutovers/{calendar_cutover_id}/completions',
          { params: { path: { calendar_cutover_id: cutoverId } } },
        )
        if (response.ok && data !== undefined) return { completed: data }
        if (error !== undefined && 'items' in error && error.items !== undefined) {
          return { unmet: error.items }
        }
        throw apiError(error, response)
      },
      cancelCutover: (_facilityId, cutoverId) =>
        unwrap(
          client.POST('/v1/calendar_cutovers/{calendar_cutover_id}/cancel', {
            params: { path: { calendar_cutover_id: cutoverId } },
          }),
        ),
    },
  }
}
