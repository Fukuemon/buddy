import {
  createMockImportPreview,
  createMockImportResult,
  createMockImportedPreview,
  exportOfIssue,
  mockExportIssues,
  mockExternalCalendars,
  mockServiceAccount,
} from '#/mocks/scheduleData'

import { ApiError, type BuddyApi } from '../client'
import { matchesName } from '../nameSearch'
import type {
  CalendarExportIssue,
  ExternalCalendar,
  FacilityId,
  ImportPreview,
  Schedule,
} from '../types'
import {
  FAKE_FACILITY_ID,
  createFakeSchedules,
  fakePatients,
  fakeStaff,
  fakeTeams,
} from './fixtures'

/** createFakeBuddyApi の設定。 */
export type FakeBuddyApiOptions = {
  /** 予定のダミーデータを散らす基準の日。デフォルトは呼んだ時の日付。 */
  baseDate?: Date
}

const assertFacility = (facilityId: FacilityId) => {
  if (facilityId !== FAKE_FACILITY_ID) {
    throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
  }
}

/** フェイクの API が読めるとみなすカレンダーの ID の末尾。ほかのカレンダーは読めない（calendar_unreadable）。 */
const FAKE_READABLE_CALENDAR_SUFFIX = '@example.com'

/**
 * メモリの上で動く BuddyApi を作る。データは呼び出しごとに独立し、ページを読み直すと初期の状態に戻る。
 *
 * FAKE_FACILITY_ID 以外の事業所を指すと、status が 403 の ApiError を投げる。
 * カレンダーの取り込みは、同じカレンダーの同じ期間を 2 回目にプレビューすると、全て取り込み済みの結果を返す。
 */
export const createFakeBuddyApi = ({
  baseDate = new Date(),
}: FakeBuddyApiOptions = {}): BuddyApi => {
  const schedules = new Map<Schedule['id'], Schedule>(
    createFakeSchedules(baseDate).map((schedule) => [schedule.id, schedule]),
  )
  let sequence = schedules.size
  const calendars = new Map<ExternalCalendar['id'], ExternalCalendar>(
    mockExternalCalendars.map((c) => [c.id, structuredClone(c)]),
  )
  const disabled = new Map<ExternalCalendar['id'], ExternalCalendar>()
  const exportIssues = new Map<CalendarExportIssue['id'], CalendarExportIssue>(
    mockExportIssues.map((i) => [i.id, structuredClone(i)]),
  )
  const imported = new Set<string>()

  const notFound = () => new ApiError(404, 'リソースが見つかりません', [], 'not_found')
  const findCalendar = (id: ExternalCalendar['id']) => {
    const calendar = calendars.get(id)
    if (calendar === undefined) throw notFound()
    return calendar
  }
  const assertReadable = (calendarId: string) => {
    if (!calendarId.endsWith(FAKE_READABLE_CALENDAR_SUFFIX)) {
      throw new ApiError(
        422,
        'カレンダーを読めません。カレンダーの共有を確認してください',
        [],
        'calendar_unreadable',
      )
    }
  }
  const conflict = (code: string, message: string) => new ApiError(409, message, [], code)
  const previewOf = (
    id: ExternalCalendar['id'],
    range: { range_start: string; range_end: string },
  ) =>
    imported.has(`${id}:${range.range_start}:${range.range_end}`)
      ? createMockImportedPreview(range)
      : createMockImportPreview(range)

  const findSchedule = (scheduleId: Schedule['id']) => {
    const schedule = schedules.get(scheduleId)
    if (schedule === undefined) throw new ApiError(404, `予定 ${scheduleId} が見つかりません`)
    return schedule
  }

  return {
    schedules: {
      list: async (facilityId, { from, to, staffIds, includeCancelled }) => {
        assertFacility(facilityId)
        const fromTime = Date.parse(from)
        const toTime = Date.parse(to)
        return [...schedules.values()].filter(
          (schedule) =>
            (includeCancelled === true || schedule.cancel === undefined) &&
            Date.parse(schedule.endsAt) > fromTime &&
            Date.parse(schedule.startsAt) < toTime &&
            (staffIds === undefined ||
              staffIds.length === 0 ||
              staffIds.includes(schedule.staffId)),
        )
      },
      get: async (facilityId, scheduleId) => {
        assertFacility(facilityId)
        return findSchedule(scheduleId)
      },
      create: async (facilityId, input) => {
        assertFacility(facilityId)
        sequence += 1
        const schedule: Schedule = { ...input, id: `schedule-${sequence}`, facilityId }
        schedules.set(schedule.id, schedule)
        return schedule
      },
      update: async (facilityId, scheduleId, input) => {
        assertFacility(facilityId)
        // 本物の API と同じく、キャンセルした予定の更新は 409 で拒む
        if (findSchedule(scheduleId).cancel !== undefined) {
          throw new ApiError(409, 'キャンセル済みの予定は変えられません', [], 'conflict')
        }
        const schedule: Schedule = { ...input, id: scheduleId, facilityId }
        schedules.set(scheduleId, schedule)
        return schedule
      },
    },
    staff: {
      list: async (facilityId, params) => {
        assertFacility(facilityId)
        return fakeStaff.filter((staff) => matchesName(staff.name, params))
      },
    },
    teams: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return fakeTeams
      },
    },
    patients: {
      list: async (facilityId, params) => {
        assertFacility(facilityId)
        return fakePatients.filter((patient) => matchesName(patient.name, params))
      },
    },
    calendars: {
      serviceAccount: async (facilityId) => {
        assertFacility(facilityId)
        return mockServiceAccount
      },
      list: async (facilityId) => {
        assertFacility(facilityId)
        return [...calendars.values()]
      },
      check: async (facilityId, calendarId) => {
        assertFacility(facilityId)
        assertReadable(calendarId)
      },
      link: async (facilityId, { staffId, calendarId }) => {
        assertFacility(facilityId)
        assertReadable(calendarId)
        const all = [...calendars.values(), ...disabled.values()]
        const same = all.find((c) => c.calendar_id === calendarId)
        if (same !== undefined && same.staff_id !== staffId)
          throw conflict('calendar_taken', 'このカレンダーは、ほかの職員に結び付いています')
        if (same !== undefined && calendars.has(same.id))
          throw conflict(
            'calendar_already_linked',
            'このカレンダーは、この職員にすでに結び付いています',
          )
        if ([...calendars.values()].some((c) => c.staff_id === staffId))
          throw conflict('staff_has_calendar', 'この職員には、ほかのカレンダーが結び付いています')
        sequence += 1
        const calendar: ExternalCalendar = same ?? {
          id: `calendar-${sequence}`,
          facility_id: facilityId,
          staff_id: staffId,
          provider: 'google',
          calendar_id: calendarId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_import: null,
        }
        disabled.delete(calendar.id)
        calendars.set(calendar.id, calendar)
        return calendar
      },
      unlink: async (facilityId, externalCalendarId) => {
        assertFacility(facilityId)
        disabled.set(externalCalendarId, findCalendar(externalCalendarId))
        calendars.delete(externalCalendarId)
      },
      preview: async (facilityId, externalCalendarId, range) => {
        assertFacility(facilityId)
        findCalendar(externalCalendarId)
        return previewOf(externalCalendarId, range)
      },
      import: async (facilityId, externalCalendarId, { decisions, ...range }) => {
        assertFacility(facilityId)
        const calendar = findCalendar(externalCalendarId)
        const preview: ImportPreview = previewOf(externalCalendarId, range)
        const revisions = new Map(
          preview.needs_review.map((r) => [r.external_event_id, r.revision]),
        )
        if (
          decisions.length !== revisions.size ||
          decisions.some((d) => revisions.get(d.external_event_id) !== d.revision)
        ) {
          throw conflict(
            'import_preview_changed',
            'プレビューの後に、外部のカレンダーの確認が必要な予定が変わりました。もう一度プレビューしてください',
          )
        }
        const result = createMockImportResult(externalCalendarId, preview, decisions)
        imported.add(`${externalCalendarId}:${range.range_start}:${range.range_end}`)
        const { already_imported_count: _, external_calendar_id: __, ...run } = result
        calendars.set(calendar.id, { ...calendar, last_import: run })
        return result
      },
      exportIssues: async (facilityId) => {
        assertFacility(facilityId)
        return [...exportIssues.values()]
      },
      retryExport: async (facilityId, exportId) => {
        assertFacility(facilityId)
        const issue = exportIssues.get(exportId)
        if (issue === undefined) throw notFound()
        exportIssues.delete(exportId)
        return { ...exportOfIssue(issue), status: 'pending', error_code: null, attempts: 0 }
      },
      acceptExport: async (facilityId, exportId) => {
        assertFacility(facilityId)
        const issue = exportIssues.get(exportId)
        if (issue === undefined) throw notFound()
        if (!issue.acceptable)
          throw conflict(
            'export_not_acceptable',
            'この予定は、Google カレンダーの内容を buddy に当てられません。buddy の内容で書き直してください',
          )
        exportIssues.delete(exportId)
        return { ...exportOfIssue(issue), status: 'succeeded', error_code: null }
      },
    },
  }
}
