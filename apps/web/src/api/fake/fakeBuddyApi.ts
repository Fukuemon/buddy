import {
  createMockCutoverPreview,
  createMockImportPreview,
  createMockImportResult,
  createMockImportedPreview,
  createMockCalendarSyncs,
  createMockProjectionSchedules,
  exportOfIssue,
  mockDepartments,
  mockExportIssues,
  mockExternalCalendars,
  mockFacility,
  mockServiceAccount,
  mockStaffList,
} from '#/mocks/scheduleData'

import { ApiError, type BuddyApi } from '../BuddyApi'
import type {
  CalendarSyncStatus,
  CalendarCutover,
  CalendarCutoverCalendar,
  CalendarCutoverUnmet,
  CalendarExportIssue,
  Department,
  ExternalCalendar,
  FacilityId,
  ImportPreview,
  Schedule,
  SourceMode,
  Team,
  TeamInput,
} from '../types'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import { occurrenceId } from '../http/recurrence'
import { fromApiSchedule } from '../http/scheduleMapper'
import { FAKE_VIEWER, createFakeSchedules, fakeTeams } from './fixtures'
import { createFakePatientApi, createFakePatientRecords } from './fakePatientApi'
import { createFakeStaffApi, localDate } from './fakeStaffApi'

/** createFakeBuddyApi の設定。 */
export type FakeBuddyApiOptions = {
  /** 予定のダミーデータを散らす基準の日。デフォルトは呼んだ時の日付。 */
  baseDate?: Date
  /**
   * 事業所の予定の正本。デフォルトは buddy_primary。google_primary にすると、予定を同期が写した Google カレンダーの予定にし、
   * 同期の状況と確認が必要な予定を返す。作成、更新、キャンセルは、予定の API と同じく Google カレンダーに書いたものとして扱う。
   * 更新とキャンセルは etag を求め、予定の etag と違えば 409（google_event_changed）を、切り替え中は 409（cutover_open）を投げる。
   */
  sourceMode?: SourceMode
  /**
   * google_primary の事業所のカレンダーの同期の状況。デフォルトは createMockCalendarSyncs（青木 一郎だけが同期できている）。
   * 予定の正本の切り替えは、全てのカレンダーの同期が成功していると始められる。
   */
  calendarSyncs?: CalendarSyncStatus[]
}

const assertFacility = (facilityId: FacilityId) => {
  if (facilityId !== MOCK_FACILITY_ID) {
    throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
  }
}

/** フェイクの API が読めるとみなすカレンダーの ID の末尾。ほかのカレンダーは読めない（calendar_unreadable）。 */
const FAKE_READABLE_CALENDAR_SUFFIX = '@example.com'

/**
 * メモリの上で動く BuddyApi を作る。データは呼び出しごとに独立し、ページを読み直すと初期の状態に戻る。
 *
 * MOCK_FACILITY_ID 以外の事業所を指すと、status が 403 の ApiError を投げる。
 * カレンダーの取り込みは、同じカレンダーの同じ期間を 2 回目にプレビューすると、全て取り込み済みの結果を返す。
 */
export const createFakeBuddyApi = ({
  baseDate = new Date(),
  sourceMode = 'buddy_primary',
  calendarSyncs: syncs,
}: FakeBuddyApiOptions = {}): BuddyApi => {
  const isGooglePrimary = sourceMode === 'google_primary'
  // 切り替えを完了すると buddy_primary に移る
  let mode = sourceMode
  let cutover: CalendarCutover | null = null
  let cutoverSequence = 0
  const cutoverRuns = new Map<
    ExternalCalendar['id'],
    NonNullable<ExternalCalendar['last_import']>
  >()
  const schedules = new Map<Schedule['id'], Schedule>(
    (isGooglePrimary
      ? createMockProjectionSchedules(baseDate).map(fromApiSchedule)
      : createFakeSchedules(baseDate)
    ).map((schedule) => [schedule.id, schedule]),
  )
  const calendarSyncs = isGooglePrimary ? (syncs ?? createMockCalendarSyncs(baseDate)) : []
  let etagSequence = 0
  const nextETag = () => {
    etagSequence += 1
    return `"fake-${etagSequence}"`
  }
  // 本物の API と同じく、google_primary の事業所では、切り替えの間の書き込みを 409 で拒み、変更とキャンセルの etag を比べる
  const assertWritable = () => {
    if (mode === 'google_primary' && cutover !== null) {
      throw new ApiError(
        409,
        'この事業所では予定の正本を切り替えています。切り替えの間は予定を作成、変更、取り消しできません',
        [],
        'cutover_open',
      )
    }
  }
  const assertETag = (schedule: Schedule, etag: string | null) => {
    if (mode !== 'google_primary') return
    if (etag === null) {
      throw new ApiError(400, '読んだ予定の etag が必須です', [], 'invalid_input')
    }
    if (schedule.reviewReason === 'recurrence_unsupported') {
      throw new ApiError(
        409,
        '繰り返しの予定の全体は、まだ buddy から変えられません',
        [],
        'conflict',
      )
    }
    if (schedule.etag !== etag) {
      throw new ApiError(
        409,
        'Google カレンダーで予定が変わっていました。最新の予定を確認してください',
        [],
        'google_event_changed',
      )
    }
  }
  const toWritten = (schedule: Schedule): Schedule =>
    mode === 'google_primary'
      ? { ...schedule, fromGoogleCalendar: true, etag: nextETag(), reviewReason: undefined }
      : schedule
  let sequence = schedules.size
  const calendars = new Map<ExternalCalendar['id'], ExternalCalendar>(
    mockExternalCalendars.map((c) => [c.id, structuredClone(c)]),
  )
  const disabled = new Map<ExternalCalendar['id'], ExternalCalendar>()
  const exportIssues = new Map<CalendarExportIssue['id'], CalendarExportIssue>(
    mockExportIssues.map((i) => [i.id, structuredClone(i)]),
  )
  const imported = new Set<string>()
  const departments = new Map<Department['id'], Department>(
    mockDepartments.map(({ id, name }) => [id, { id, name }]),
  )
  const teams = new Map<Team['id'], Team>(fakeTeams.map((t) => [t.id, { ...t }]))
  let unitSequence = 0
  const byName = <T extends { name: string }>(units: Iterable<T>) =>
    [...units].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  // 予定の API と同じく、同じ事業所のほかの部署かチームと完全に一致する名前は 409 で拒む
  const assertUniqueName = (
    units: Iterable<{ id: string; name: string }>,
    name: string,
    selfId: string,
    label: string,
  ) => {
    if ([...units].some((u) => u.id !== selfId && u.name === name)) {
      throw new ApiError(409, `${label} ${name} はこの事業所にすでにあります`, [], 'conflict')
    }
  }
  const saveTeam = (id: Team['id'], { name, color }: TeamInput) => {
    assertUniqueName(teams.values(), name, id, 'チーム')
    const team: Team = { id, name, color }
    teams.set(id, team)
    return team
  }
  const saveDepartment = (id: Department['id'], name: string) => {
    assertUniqueName(departments.values(), name, id, '部署')
    const department: Department = { id, name }
    departments.set(id, department)
    return department
  }

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
  // 本物の API と同じく、切り替えの間は、切り替えの range_start から終わりの無い期間だけを受ける
  const assertCutoverRange = (range: { range_start: string; range_end?: string | null }) => {
    const open =
      cutover !== null && (range.range_start !== cutover.range_start || range.range_end != null)
    if (open || (cutover === null && range.range_end == null)) {
      throw new ApiError(400, '取り込みの期間が正しくありません', [], 'invalid_input')
    }
  }
  const cutoverCalendars = (): CalendarCutoverCalendar[] =>
    [...calendars.values()].map((calendar) => {
      const sync = calendarSyncs.find((s) => s.external_calendar_id === calendar.id)
      const staffName = mockStaffList.find((s) => s.id === calendar.staff_id)?.username ?? ''
      return {
        external_calendar_id: calendar.id,
        staff_id: calendar.staff_id,
        staff_name: sync?.staff_name ?? staffName,
        last_status: sync?.last_status ?? 'succeeded',
        last_succeeded_at: sync?.last_succeeded_at ?? baseDate.toISOString(),
        last_error: sync?.last_error ?? null,
        last_import: cutover === null ? null : (cutoverRuns.get(calendar.id) ?? null),
      }
    })
  const findOpenCutover = (cutoverId: CalendarCutover['id']) => {
    if (cutover === null || cutover.id !== cutoverId)
      throw conflict('cutover_not_open', 'この切り替えは、すでに完了したか、やめています')
    return cutover
  }
  const finishCutover = (status: CalendarCutover['status']) => {
    const done: CalendarCutover = {
      ...findOpenCutover(cutover?.id ?? ''),
      status,
      finished_at: new Date().toISOString(),
    }
    cutover = null
    cutoverRuns.clear()
    return done
  }
  const previewOf = (
    id: ExternalCalendar['id'],
    range: { range_start: string; range_end?: string | null },
  ) =>
    imported.has(`${id}:${range.range_start}:${range.range_end ?? ''}`)
      ? createMockImportedPreview(range)
      : cutover !== null
        ? createMockCutoverPreview(range.range_start)
        : createMockImportPreview(range)

  const patientRecords = createFakePatientRecords()
  const staffApi = createFakeStaffApi({
    assertFacility,
    schedules: () => schedules.values(),
    viewerId: FAKE_VIEWER.staffId,
    today: () => baseDate,
    departments: () => [...departments.values()],
    teams: () => [...teams.values()],
    patients: () => patientRecords.values(),
  })
  const patientApi = createFakePatientApi({
    assertFacility,
    patients: patientRecords,
    staff: () => staffApi.staff.listRecords(MOCK_FACILITY_ID),
    schedules: () => schedules.values(),
    today: () => baseDate,
  })

  const findSchedule = (scheduleId: Schedule['id']) => {
    const schedule = schedules.get(scheduleId)
    if (schedule === undefined) throw new ApiError(404, `予定 ${scheduleId} が見つかりません`)
    return schedule
  }

  return {
    facilities: {
      get: async (facilityId) => {
        assertFacility(facilityId)
        return { id: mockFacility.id, name: mockFacility.name, sourceMode: mode }
      },
    },
    me: {
      get: (facilityId) => staffApi.staff.get(facilityId, FAKE_VIEWER.staffId),
      externalCalendar: async (facilityId) => {
        assertFacility(facilityId)
        return [...calendars.values()].find((c) => c.staff_id === FAKE_VIEWER.staffId) ?? null
      },
    },
    schedules: {
      list: async (facilityId, { from, to, staffIds, includeCancelled }) => {
        assertFacility(facilityId)
        const fromTime = Date.parse(from)
        const toTime = Date.parse(to)
        const isSelectedStaff = (staffId: string) =>
          staffIds === undefined || staffIds.length === 0 || staffIds.includes(staffId)
        const all = [...schedules.values()].filter(
          (schedule) =>
            (includeCancelled === true || schedule.cancel === undefined) &&
            isSelectedStaff(schedule.staffId),
        )
        return {
          schedules: all.filter(
            (schedule) =>
              Date.parse(schedule.endsAt) > fromTime && Date.parse(schedule.startsAt) < toTime,
          ),
          needsReview: all.filter((schedule) => schedule.reviewReason !== undefined),
          sourceMode: mode,
          calendarSyncs:
            mode === 'google_primary'
              ? calendarSyncs.filter((sync) => isSelectedStaff(sync.staff_id))
              : [],
          cutover:
            cutover === null
              ? null
              : {
                  started_at: cutover.started_at,
                  started_by: cutover.started_by,
                  started_by_name:
                    mockStaffList.find((s) => s.id === cutover?.started_by)?.username ?? '',
                  range_start: cutover.range_start,
                },
        }
      },
      get: async (facilityId, scheduleId) => {
        assertFacility(facilityId)
        return findSchedule(scheduleId)
      },
      create: async (facilityId, input, id) => {
        assertFacility(facilityId)
        assertWritable()
        // 本物の API と同じく、同じ id の送り直しは、作った予定を返す
        const sent = schedules.get(id)
        if (sent !== undefined) return sent
        sequence += 1
        const schedule = toWritten({ ...input, id, facilityId })
        schedules.set(schedule.id, schedule)
        return schedule
      },
      update: async (facilityId, scheduleId, input, etag) => {
        assertFacility(facilityId)
        assertWritable()
        const current = findSchedule(scheduleId)
        // 本物の API と同じく、キャンセルした予定の更新は 409 で拒む
        if (current.cancel !== undefined) {
          throw new ApiError(409, 'キャンセル済みの予定は変えられません', [], 'conflict')
        }
        assertETag(current, etag)
        const schedule = toWritten({ ...input, id: scheduleId, facilityId })
        schedules.set(scheduleId, schedule)
        return schedule
      },
      cancel: async (facilityId, scheduleId, reason, etag) => {
        assertFacility(facilityId)
        assertWritable()
        const current = findSchedule(scheduleId)
        if (current.cancel !== undefined) {
          throw new ApiError(409, 'この予定はすでにキャンセルされています', [], 'conflict')
        }
        assertETag(current, etag)
        // 本物の API と同じく、google_primary の事業所では Google カレンダーの予定を消し、理由は残さない
        if (mode === 'google_primary') schedules.delete(scheduleId)
        else schedules.set(scheduleId, { ...current, cancel: { reason } })
      },
      // 本物の API と同じく、google_primary の事業所、キャンセル済みの予定、開始の日が今日より前の予定の削除を拒む（ADR-0040）
      delete: async (facilityId, scheduleId) => {
        assertFacility(facilityId)
        if (mode === 'google_primary') {
          throw new ApiError(
            409,
            'この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください',
            [],
            'google_primary',
          )
        }
        const current = findSchedule(scheduleId)
        if (current.cancel !== undefined) {
          throw new ApiError(409, 'キャンセル済みの予定は削除できません', [], 'conflict')
        }
        // 本物の API は Asia/Tokyo の今日と比べる。フェイクは端末の時刻帯の今日と比べる
        if (current.startsAt.slice(0, 10) < localDate(baseDate)) {
          throw new ApiError(400, '今日より前の予定は削除できません', [], 'invalid_input')
        }
        schedules.delete(scheduleId)
      },
      // フェイクの予定は回を規則から求めないので、適用の日以降の回の規則だけを書き換え、回の日は動かさない
      // 回を求めず、最初の回だけを、繰り返しの予定を指す予定として置く
      createRecurring: async (facilityId, input, rule, id) => {
        assertFacility(facilityId)
        assertWritable()
        const date = input.startsAt.slice(0, 10)
        const first = occurrenceId(id, date)
        if (!schedules.has(first)) {
          schedules.set(
            first,
            toWritten({
              ...input,
              id: first,
              facilityId,
              recurrence: { recurringScheduleId: id, rule },
            }),
          )
        }
        return { id, date }
      },
      changeRule: async (facilityId, recurringScheduleId, { effectiveDate, rule, id }, etag) => {
        assertFacility(facilityId)
        assertWritable()
        const occurrences = [...schedules.values()].filter(
          (schedule) => schedule.recurrence?.recurringScheduleId === recurringScheduleId,
        )
        if (occurrences.length === 0) {
          throw new ApiError(404, `繰り返しの予定 ${recurringScheduleId} が見つかりません`)
        }
        assertETag(occurrences[0], etag)
        for (const schedule of occurrences) {
          if (schedule.startsAt.slice(0, 10) < effectiveDate) continue
          schedules.set(schedule.id, {
            ...schedule,
            recurrence: { recurringScheduleId: id, rule },
          })
        }
        return { id, date: effectiveDate }
      },
    },
    ...staffApi,
    teams: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return byName(teams.values())
      },
      create: async (facilityId, input) => {
        assertFacility(facilityId)
        unitSequence += 1
        return saveTeam(`team-fake-${unitSequence}`, input)
      },
      update: async (facilityId, teamId, input) => {
        assertFacility(facilityId)
        if (!teams.has(teamId)) throw notFound()
        return saveTeam(teamId, input)
      },
    },
    departments: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return byName(departments.values())
      },
      create: async (facilityId, name) => {
        assertFacility(facilityId)
        unitSequence += 1
        return saveDepartment(`department-fake-${unitSequence}`, name)
      },
      update: async (facilityId, departmentId, name) => {
        assertFacility(facilityId)
        if (!departments.has(departmentId)) throw notFound()
        return saveDepartment(departmentId, name)
      },
    },
    ...patientApi,
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
        assertCutoverRange(range)
        return previewOf(externalCalendarId, range)
      },
      import: async (facilityId, externalCalendarId, { decisions, ...range }) => {
        assertFacility(facilityId)
        const calendar = findCalendar(externalCalendarId)
        // 本物の API と同じく、google_primary の事業所では、切り替えの間だけ取り込める
        if (mode === 'google_primary' && cutover === null) {
          throw new ApiError(
            409,
            'この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください',
            [],
            'google_primary',
          )
        }
        assertCutoverRange(range)
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
        imported.add(`${externalCalendarId}:${range.range_start}:${range.range_end ?? ''}`)
        const { already_imported_count: _, external_calendar_id: __, ...run } = result
        calendars.set(calendar.id, { ...calendar, last_import: run })
        if (cutover !== null) cutoverRuns.set(calendar.id, run)
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
      cutoverStatus: async (facilityId) => {
        assertFacility(facilityId)
        return { cutover, calendars: cutoverCalendars() }
      },
      startCutover: async (facilityId) => {
        assertFacility(facilityId)
        if (mode !== 'google_primary')
          throw conflict(
            'cutover_not_google_primary',
            'この事業所の予定の正本は、すでに buddy です',
          )
        if (cutover !== null)
          throw conflict('cutover_open', 'この事業所では、切り替えをすでに始めています')
        const notSynced = cutoverCalendars().filter((c) => c.last_status !== 'succeeded')
        if (notSynced.length > 0)
          throw conflict(
            'cutover_sync_not_ready',
            `最後の同期が成功していないカレンダーがあります（${notSynced.map((c) => c.staff_name).join('、')}）。同期が成功してから始めてください`,
          )
        cutoverSequence += 1
        cutover = {
          id: `cutover-${cutoverSequence}`,
          facility_id: facilityId,
          status: 'open',
          range_start: `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-01`,
          started_by: FAKE_VIEWER.staffId,
          started_at: new Date().toISOString(),
          finished_at: null,
        }
        return cutover
      },
      completeCutover: async (facilityId, cutoverId) => {
        assertFacility(facilityId)
        findOpenCutover(cutoverId)
        // 本物の API と同じく、この切り替えで取り込んでいないカレンダーがあれば完了を拒む
        const unmet = cutoverCalendars()
          .filter((c) => c.last_import === null)
          .map((c): CalendarCutoverUnmet => ({
            external_calendar_id: c.external_calendar_id,
            staff_id: c.staff_id,
            staff_name: c.staff_name,
            reason: 'not_imported',
            external_event_id: null,
            date: null,
            start_time: null,
            end_time: null,
            ends_next_day: false,
            review_reason: null,
          }))
        if (unmet.length > 0) return { unmet }
        mode = 'buddy_primary'
        return { completed: finishCutover('completed') }
      },
      cancelCutover: async (facilityId, cutoverId) => {
        assertFacility(facilityId)
        findOpenCutover(cutoverId)
        return finishCutover('canceled')
      },
    },
  }
}
