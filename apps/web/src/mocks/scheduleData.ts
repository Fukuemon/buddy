import type { components } from '#/api/generated/schedule'
import { STAFF_MANAGE, type ServiceCode } from '#/api/types'

type Schemas = components['schemas']

/** 予定の API の偽物が返す、架空の事業所。 */
export const MOCK_FACILITY_ID = 'facility-demo'

const STAMP = '2026-10-01T00:00:00Z'
const stamps = { created_at: STAMP, updated_at: STAMP }

const team = (id: string, name: string): Schemas['Unit'] => ({
  id,
  facility_id: MOCK_FACILITY_ID,
  name,
  ...stamps,
})

export const mockTeams: Schemas['Unit'][] = [team('team-a', 'A チーム'), team('team-b', 'B チーム')]

const staff = (id: string, username: string, teamRef: Schemas['Ref']): Schemas['Staff'] => ({
  id,
  username,
  email: `${id}@example.com`,
  phone_number: null,
  facility_id: MOCK_FACILITY_ID,
  department: { id: 'department-1', name: '訪問看護部' },
  team: teamRef,
  position: { id: 'position-1', name: '看護師' },
  ...stamps,
})

const teamA = { id: 'team-a', name: 'A チーム' }
const teamB = { id: 'team-b', name: 'B チーム' }

export const mockStaff: Schemas['Staff'][] = [
  staff('staff-1', '青木 一郎', teamA),
  staff('staff-2', '石川 二葉', teamA),
  staff('staff-3', '上田 三奈', teamB),
  staff('staff-4', '江藤 四郎', teamB),
]

/** ログインした職員として GET /v1/me が返す職員。職員の管理の権限を持つ。 */
export const mockMe: Schemas['StaffDetail'] = {
  ...mockStaff[0],
  sub: 'dev-aoki',
  policies: [
    {
      user_policy_id: 'user-policy-1',
      policy_id: 'policy-staff-manage',
      code: STAFF_MANAGE,
      name: '職員の管理',
      target_user_ids: [],
      target_team_ids: [],
    },
  ],
}

export const mockScheduleTypes: Schemas['ScheduleType'][] = [
  { id: 'type-normal', name: '通常' },
  { id: 'type-visit', name: '訪問' },
]

/** サービスコード。表記と提供時間の範囲は、schedule-api のマイグレーション（000007）と同じにする。 */
export const mockServiceCodes: Schemas['ServiceCode'][] = (
  [
    ['code-i2', '訪看I2', 20, 29],
    ['code-i3', '訪看I3', 30, 59],
    ['code-i4', '訪看I4', 60, 89],
    ['code-i5', '訪看I5', 21, 40],
    ['code-i5-2', '訪看I5・2超', 41, 60],
    ['code-p2', '予防看I2', 20, 29],
    ['code-p3', '予防看I3', 30, 59],
    ['code-p4', '予防看I4', 60, 89],
    ['code-p5', '予防看I5', 21, 40],
    ['code-p5-2', '予防看I5・2超', 41, 60],
    ['code-medical', '医', 30, 90],
  ] as const
).map(([id, code, start, end]) => ({
  id,
  code,
  service_time_range_start: start,
  service_time_range_end: end,
}))

export const mockVisitCategories: Schemas['VisitCategory'][] = [
  { id: 'category-night', name: '夜勤' },
  { id: 'category-emergency', name: '緊急' },
  { id: 'category-hospital', name: '入院' },
]

const patient = (id: string, name: string): Schemas['Patient'] => ({
  id,
  facility_id: MOCK_FACILITY_ID,
  name,
  preferred_time: '午前',
  preferred_gender: '女性',
  service_code_id: 'code-i2',
  service_code: '訪看I2',
  assigned_staff_id: 'staff-1',
  assigned_staff_name: '青木 一郎',
  ...stamps,
})

export const mockPatients: Schemas['Patient'][] = [
  patient('patient-1', '加藤 春子'),
  patient('patient-2', '木村 夏夫'),
  patient('patient-3', '久保 秋代'),
  patient('patient-4', '小林 冬馬'),
]

const pad = (value: number) => String(value).padStart(2, '0')

/** 基準日から days 日後の日付を YYYY-MM-DD で返す。 */
const dayAfter = (base: Date, days: number) => {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 基準日の前後に散らした、架空の予定を作る。 */
export const createMockSchedules = (base: Date): Schemas['Schedule'][] => {
  const schedule = (
    id: string,
    days: number,
    staffIndex: number,
    times: [string, string],
    detail: Partial<Schemas['Schedule']>,
  ): Schemas['Schedule'] => ({
    id,
    facility_id: MOCK_FACILITY_ID,
    schedule_type_id: 'type-normal',
    schedule_type: '通常',
    date: dayAfter(base, days),
    start_time: times[0],
    end_time: times[1],
    is_over_time_work: false,
    staff_id: mockStaff[staffIndex].id,
    staff_name: mockStaff[staffIndex].username,
    title: null,
    description: null,
    recurring_schedule_id: null,
    visit_info: null,
    cancel: null,
    ...stamps,
    ...detail,
  })
  const visit = (
    patientIndex: number,
    staffIndex: number,
    code: ServiceCode,
    categoryIds: string[] = [],
  ): Partial<Schemas['Schedule']> => {
    const serviceCode = mockServiceCodes.find((c) => c.code === code)
    if (serviceCode === undefined) throw new Error(`架空のサービスコードに ${code} がない`)
    return {
      schedule_type_id: 'type-visit',
      schedule_type: '訪問',
      visit_info: {
        id: `visit-${patientIndex}`,
        patient_id: mockPatients[patientIndex].id,
        patient_name: mockPatients[patientIndex].name,
        assigned_staff_id: mockStaff[staffIndex].id,
        assigned_staff_name: mockStaff[staffIndex].username,
        companion_id: null,
        companion_name: null,
        service_code_id: serviceCode.id,
        service_code: serviceCode.code,
        visit_categories: mockVisitCategories.filter((c) => categoryIds.includes(c.id)),
      },
    }
  }
  return [
    schedule('schedule-1', 0, 0, ['09:00', '09:29'], visit(0, 0, '訪看I2')),
    schedule('schedule-2', 0, 1, ['10:30', '11:29'], visit(1, 1, '訪看I3', ['category-emergency'])),
    schedule('schedule-3', 0, 2, ['13:00', '14:00'], {
      title: 'カンファレンス',
      description: '事業所の会議室',
    }),
    schedule('schedule-4', 1, 3, ['15:00', '16:29'], visit(2, 3, '訪看I4')),
    schedule('schedule-5', -2, 0, ['14:00', '16:00'], { title: '研修' }),
  ]
}

const nameOf = <T extends { id: string }>(rows: T[], id: string, name: (row: T) => string) => {
  const row = rows.find((r) => r.id === id)
  return row ? name(row) : ''
}

/** 予定の作成と置き換えの要求から、API が返す予定を組み立てる。名前はマスタと職員と利用者から引く。 */
export const scheduleFromRequest = (
  id: string,
  body: Schemas['SlotRequest'],
): Schemas['Schedule'] => {
  const visit = body.visit_info
  return {
    id,
    facility_id: MOCK_FACILITY_ID,
    schedule_type_id: body.schedule_type_id,
    schedule_type: visit ? '訪問' : '通常',
    date: body.date,
    start_time: body.start_time,
    end_time: body.end_time,
    is_over_time_work: body.start_time >= '17:00',
    staff_id: body.staff_id,
    staff_name: nameOf(mockStaff, body.staff_id, (s) => s.username),
    title: body.title ?? null,
    description: body.description ?? null,
    recurring_schedule_id: null,
    visit_info: visit
      ? {
          id: `visit-of-${id}`,
          patient_id: visit.patient_id,
          patient_name: nameOf(mockPatients, visit.patient_id, (p) => p.name),
          assigned_staff_id: visit.assigned_staff_id,
          assigned_staff_name: nameOf(mockStaff, visit.assigned_staff_id, (s) => s.username),
          companion_id: visit.companion_id ?? null,
          companion_name: visit.companion_id
            ? nameOf(mockStaff, visit.companion_id, (s) => s.username)
            : null,
          service_code_id: visit.service_code_id,
          service_code: nameOf(mockServiceCodes, visit.service_code_id, (c) => c.code),
          visit_categories: mockVisitCategories.filter((c) =>
            visit.visit_category_ids?.includes(c.id),
          ),
        }
      : null,
    cancel: null,
    ...stamps,
  }
}

/** 職員がカレンダーを共有する相手として返す、架空のサービスアカウント。 */
export const mockServiceAccount = 'buddy-calendar@example.iam.gserviceaccount.com'

/** 結び付けたカレンダー。青木 一郎は取り込んだことがあり、石川 二葉はまだ取り込んでいない。 */
export const mockExternalCalendars: Schemas['ExternalCalendar'][] = [
  {
    id: 'calendar-1',
    facility_id: MOCK_FACILITY_ID,
    staff_id: 'staff-1',
    provider: 'google',
    calendar_id: 'staff-1@example.com',
    ...stamps,
    last_import: {
      id: 'import-1',
      range_start: '2026-10-01',
      range_end: '2026-10-31',
      status: 'succeeded',
      imported_count: 12,
      skipped_count: 1,
      started_at: '2026-10-15T01:00:00Z',
      finished_at: '2026-10-15T01:00:05Z',
    },
  },
  {
    id: 'calendar-2',
    facility_id: MOCK_FACILITY_ID,
    staff_id: 'staff-2',
    provider: 'google',
    calendar_id: 'staff-2@example.com',
    ...stamps,
    last_import: null,
  },
]

/** 下見の結果。利用者を 1 人に決められない予定が 2 件（繰り返し 1 件）と、取り込まない予定が 3 件ある。 */
export const createMockImportPreview = (
  range: Schemas['ImportRange'],
): Schemas['ImportPreview'] => ({
  ...range,
  counts: {
    import: 18,
    import_visit: 15,
    import_normal: 3,
    expanded_occurrences: 4,
    recurring: 3,
    recurring_as_rule: 2,
    recurring_expanded: 1,
    needs_review: 2,
    skipped: 3,
    already_imported: 0,
  },
  needs_review: [
    {
      external_event_id: 'event-ambiguous',
      date: '2026-11-04',
      start_time: '10:00',
      end_time: '11:00',
      service: '訪看I2',
      client_name: '加藤 春子',
      reason: 'patient_ambiguous',
      recurrence: {
        frequency: 'weekly',
        day_of_week: 3,
        day_of_month: null,
        week_of_month: null,
        end_date: null,
      },
      candidates: [
        { patient_id: 'patient-1', name: '加藤 春子', assigned_staff_name: '青木 一郎' },
        { patient_id: 'patient-5', name: '加藤 春子', assigned_staff_name: '上田 三奈' },
      ],
    },
    {
      external_event_id: 'event-missing',
      date: '2026-11-09',
      start_time: '14:00',
      end_time: '14:30',
      service: '訪看I3',
      client_name: '架空 太郎',
      reason: 'patient_not_found',
      recurrence: null,
      candidates: [],
    },
  ],
  skipped: [
    { date: '2026-11-03', start_time: null, end_time: null, all_day: true, reason: 'all_day' },
    {
      date: '2026-11-12',
      start_time: '17:00',
      end_time: '09:00',
      all_day: false,
      reason: 'multi_day',
    },
    {
      date: '2026-11-20',
      start_time: '10:00',
      end_time: '10:30',
      all_day: false,
      reason: 'service_not_found',
    },
  ],
})

/** 全て取り込み済みの期間の下見の結果。 */
export const createMockImportedPreview = (
  range: Schemas['ImportRange'],
): Schemas['ImportPreview'] => {
  const preview = createMockImportPreview(range)
  return {
    ...preview,
    counts: {
      ...preview.counts,
      import: 0,
      import_visit: 0,
      import_normal: 0,
      expanded_occurrences: 0,
      recurring: 0,
      recurring_as_rule: 0,
      recurring_expanded: 0,
      needs_review: 0,
      already_imported: 20,
    },
    needs_review: [],
  }
}

/** 下見の結果を、取り込み方を当てて確定した結果。取り込まないを選んだ予定は、取り込まなかった件数に足す。 */
export const createMockImportResult = (
  externalCalendarId: string,
  preview: Schemas['ImportPreview'],
  decisions: Schemas['ImportDecision'][],
): Schemas['ImportResult'] => {
  const chosenSkip = decisions.filter((d) => d.action === 'skip').length
  return {
    id: 'import-2',
    external_calendar_id: externalCalendarId,
    range_start: preview.range_start,
    range_end: preview.range_end,
    status: 'succeeded',
    imported_count: preview.counts.import + decisions.length - chosenSkip,
    skipped_count: preview.counts.skipped + chosenSkip,
    already_imported_count: preview.counts.already_imported,
    started_at: '2026-10-22T01:00:00Z',
    finished_at: '2026-10-22T01:00:03Z',
  }
}
