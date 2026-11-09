import type { components } from '#/api/generated/schedule'
import type { ServiceCode } from '#/api/types'
import { RECEIPT_CHECK, STAFF_MANAGE } from '#/api/permissions'

type Schemas = components['schemas']

/** 予定の API の MSW の handler と、src/api/fake/ の BuddyApi が使う、ダミーの事業所。 */
export const MOCK_FACILITY_ID = 'facility-demo'

const STAMP = '2026-10-01T00:00:00Z'
const stamps = { created_at: STAMP, updated_at: STAMP }

const team = (id: string, name: string, color: Schemas['TeamColor']): Schemas['Team'] => ({
  id,
  facility_id: MOCK_FACILITY_ID,
  name,
  color,
  ...stamps,
})

export const mockTeams: Schemas['Team'][] = [
  team('team-a', 'A チーム', 'blue'),
  team('team-b', 'B チーム', 'orange'),
]

const staff = (id: string, username: string, teamRef: Schemas['Ref']): Schemas['Staff'] => ({
  id,
  username,
  email: `${id}@example.com`,
  phone_number: null,
  status: 'active',
  leave_started_at: null,
  leave_return_date: null,
  retired_at: null,
  facility_id: MOCK_FACILITY_ID,
  department: { id: 'department-1', name: '訪問看護部' },
  team: teamRef,
  position: { id: 'position-1', name: '看護師' },
  visits: true,
  ...stamps,
})

const teamA = { id: 'team-a', name: 'A チーム' }
const teamB = { id: 'team-b', name: 'B チーム' }

export const mockStaffList: Schemas['Staff'][] = [
  staff('staff-1', '青木 一郎', teamA),
  staff('staff-2', '石川 二葉', teamA),
  staff('staff-3', '上田 三奈', teamB),
  staff('staff-4', '江藤 四郎', teamB),
]

/** ログインした職員として GET /v1/me が返す職員。職員の管理の権限、事業所の全ての予定の編集の権限、照合の権限を持つ。 */
export const mockMe: Schemas['StaffDetail'] = {
  ...mockStaffList[0],
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
    {
      user_policy_id: 'user-policy-3',
      policy_id: 'policy-schedule-all-edit',
      code: 'schedule.all.edit',
      name: '事業所の全ての予定の編集',
      target_user_ids: [],
      target_team_ids: [],
    },
    {
      user_policy_id: 'user-policy-2',
      policy_id: 'policy-receipt-check',
      code: RECEIPT_CHECK,
      name: '照合',
      target_user_ids: [],
      target_team_ids: [],
    },
  ],
}

const department = (id: string, name: string): Schemas['Unit'] => ({
  id,
  facility_id: MOCK_FACILITY_ID,
  name,
  ...stamps,
})

export const mockDepartments: Schemas['Unit'][] = [
  department('department-1', '訪問看護部'),
  department('department-2', 'リハビリ部'),
]

const policy = (id: string, code: string, name: string, needsTarget: boolean) => ({
  id,
  code,
  name,
  needs_target: needsTarget,
  ...stamps,
})

/** 権限。code と名前は、予定の API のマイグレーション（000001 と 000009）が入れる 9 行と同じにする。 */
export const mockPolicies: Schemas['Policy'][] = [
  policy('policy-self-edit', 'schedule.self.edit', '自分の予定の編集', false),
  policy('policy-user-read', 'schedule.user.read', '指定した職員の予定の閲覧', true),
  policy('policy-user-edit', 'schedule.user.edit', '指定した職員の予定の編集', true),
  policy('policy-team-read', 'schedule.team.read', '指定したチームの職員の予定の閲覧', true),
  policy('policy-team-edit', 'schedule.team.edit', '指定したチームの職員の予定の編集', true),
  policy('policy-all-read', 'schedule.all.read', '事業所の全ての予定の閲覧', false),
  policy('policy-all-edit', 'schedule.all.edit', '事業所の全ての予定の編集', false),
  policy('policy-staff-manage', STAFF_MANAGE, '職員の管理', false),
  policy('policy-receipt-check', RECEIPT_CHECK, '照合', false),
]

const policiesOf = (...codes: string[]) => mockPolicies.filter((p) => codes.includes(p.code))

/** 役職。名前の順に並べる。 */
export const mockPositions: Schemas['Position'][] = [
  {
    id: 'position-1',
    facility_id: MOCK_FACILITY_ID,
    name: '看護師',
    policies: policiesOf('schedule.self.edit', 'schedule.team.read'),
    ...stamps,
  },
  {
    id: 'position-clerk',
    facility_id: MOCK_FACILITY_ID,
    name: '事務',
    policies: policiesOf('schedule.all.read', 'schedule.all.edit', RECEIPT_CHECK),
    ...stamps,
  },
  {
    id: 'position-manager',
    facility_id: MOCK_FACILITY_ID,
    name: 'マネージャー',
    policies: policiesOf(
      'schedule.self.edit',
      'schedule.all.read',
      'schedule.all.edit',
      STAFF_MANAGE,
      RECEIPT_CHECK,
    ),
    ...stamps,
  },
]

export const mockScheduleTypes: Schemas['ScheduleType'][] = [
  { id: 'type-normal', name: '通常' },
  { id: 'type-visit', name: '訪問' },
]

/** サービスコード。表記と提供時間の範囲は、予定の API のマイグレーション（000007）と同じにする。 */
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

/** 利用者。サービスコードを省くと訪看I2 にする。 */
const patient = (
  id: string,
  name: string,
  [serviceCodeId, serviceCode]: [string, string] = ['code-i2', '訪看I2'],
): Schemas['Patient'] => ({
  id,
  facility_id: MOCK_FACILITY_ID,
  name,
  preferred_time: '午前',
  preferred_gender: '女性',
  service_code_id: serviceCodeId,
  service_code: serviceCode,
  assigned_staff_id: 'staff-1',
  assigned_staff_name: '青木 一郎',
  ended_at: null,
  ...stamps,
})

export const mockPatients: Schemas['Patient'][] = [
  patient('patient-1', '加藤 春子'),
  patient('patient-2', '木村 夏夫', ['code-i3', '訪看I3']),
  patient('patient-3', '久保 秋代'),
  patient('patient-4', '小林 冬馬'),
  { ...patient('patient-ended', '近藤 晴美'), ended_at: '2026-10-01T00:00:00Z' },
]

const pad = (value: number) => String(value).padStart(2, '0')

/** 基準日から days 日後の日付を YYYY-MM-DD で返す。 */
const dayAfter = (base: Date, days: number) => {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 基準日の前後に散らした、ダミーの予定を作る。 */
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
    ends_next_day: false,
    is_over_time_work: false,
    staff_id: mockStaffList[staffIndex].id,
    staff_name: mockStaffList[staffIndex].username,
    title: null,
    description: null,
    recurring_schedule_id: null,
    visit_info: null,
    cancel: null,
    source: 'buddy',
    review_reason: null,
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
    if (serviceCode === undefined) throw new Error(`ダミーのサービスコードに ${code} がない`)
    return {
      schedule_type_id: 'type-visit',
      schedule_type: '訪問',
      visit_info: {
        id: `visit-${patientIndex}`,
        patient_id: mockPatients[patientIndex].id,
        patient_name: mockPatients[patientIndex].name,
        assigned_staff_id: mockStaffList[staffIndex].id,
        assigned_staff_name: mockStaffList[staffIndex].username,
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
    schedule('schedule-6', 0, 3, ['11:00', '11:59'], {
      ...visit(2, 3, '訪看I3'),
      cancel: { id: 'cancel-6', schedule_id: 'schedule-6', reason: '利用者の体調不良' },
    }),
    schedule('schedule-7', 0, 1, ['22:00', '01:00'], {
      title: '夜勤',
      ends_next_day: true,
      is_over_time_work: true,
    }),
  ]
}

/** ダミーの事業所。予定の正本は buddy（buddy_primary）である。 */
export const mockFacility: Schemas['Facility'] = {
  id: MOCK_FACILITY_ID,
  name: 'buddy 訪問看護ステーション',
  source_mode: 'buddy_primary',
  ...stamps,
}

/**
 * google_primary の事業所で、同期が写した Google カレンダーの予定（Projection）のダミーを作る。
 * createMockSchedules のキャンセルしていない予定を Google カレンダーの予定にし、確認が必要な予定を 3 件足す。
 * 繰り返しの規則を写せない予定（recurrence_unsupported）は、基準日の 40 日前を最初の回にした 1 件にし、表示の期間の外に置く。
 */
export const createMockProjectionSchedules = (base: Date): Schemas['Schedule'][] => {
  const fromGoogle = (schedule: Schemas['Schedule']): Schemas['Schedule'] => ({
    ...schedule,
    id: `gcal-${schedule.id}`,
    recurring_schedule_id: null,
    visit_info:
      schedule.visit_info === null
        ? null
        : { ...schedule.visit_info, id: `gcal-${schedule.visit_info.id}` },
    source: 'google_calendar',
    etag: `"etag-${schedule.id}"`,
  })
  const needsReview = (
    id: string,
    days: number,
    staffIndex: number,
    times: [string, string],
    title: string,
    reason: Schemas['ScheduleReviewReason'],
  ): Schemas['Schedule'] => ({
    ...fromGoogle(createMockSchedules(base)[0]),
    id,
    schedule_type_id: 'type-normal',
    schedule_type: '通常',
    date: dayAfter(base, days),
    start_time: times[0],
    end_time: times[1],
    staff_id: mockStaffList[staffIndex].id,
    staff_name: mockStaffList[staffIndex].username,
    title,
    visit_info: null,
    review_reason: reason,
  })
  return [
    ...createMockSchedules(base)
      .filter((schedule) => schedule.cancel === null)
      .map(fromGoogle),
    needsReview('gcal-review-1', 0, 1, ['15:00', '15:29'], '佐藤 花子 訪看I2', 'patient_not_found'),
    needsReview(
      'gcal-review-2',
      1,
      0,
      ['10:00', '10:59'],
      '加藤 春子 訪問',
      'service_code_not_found',
    ),
    needsReview(
      'gcal-review-3',
      -40,
      2,
      ['09:00', '09:59'],
      '定例の訪問',
      'recurrence_unsupported',
    ),
  ]
}

/**
 * google_primary の事業所の、Google カレンダーの終日の予定のダミーを作る。
 * 青木 一郎の基準日の「休み」と、石川 二葉の基準日の前日から翌日までの「研修」を置く。
 */
export const createMockAllDayEvents = (base: Date): Schemas['AllDayEvent'][] => [
  {
    id: 'gcal-allday-1',
    staff_id: mockStaffList[0].id,
    staff_name: mockStaffList[0].username,
    start_date: dayAfter(base, 0),
    end_date: dayAfter(base, 0),
    title: '休み',
  },
  {
    id: 'gcal-allday-2',
    staff_id: mockStaffList[1].id,
    staff_name: mockStaffList[1].username,
    start_date: dayAfter(base, -1),
    end_date: dayAfter(base, 1),
    title: '研修',
  },
]

/**
 * google_primary の事業所の、カレンダーに出せない予定のダミーを作る。予定の API は件数だけを返すので、画面のフェイクが期間で絞れるよう、
 * 予定ごとに職員と、かかる最初の日と最後の日を持つ。日付の無い予定は、日時を読めない予定で、どの期間でも数える。
 * 青木 一郎の基準日から 2 日にわたる予定と、上田 三奈の日時を読めない予定を置く。
 */
export const createMockUnlistedEvents = (
  base: Date,
): { staffId: string; startDate: string | null; endDate: string | null }[] => [
  { staffId: mockStaffList[0].id, startDate: dayAfter(base, 0), endDate: dayAfter(base, 1) },
  { staffId: mockStaffList[2].id, startDate: null, endDate: null },
]

/**
 * google_primary の事業所の、カレンダーの同期の状況のダミーを作る。
 * 青木 一郎は 1 分前に同期でき、石川 二葉は 30 分前から同期に失敗し、上田 三奈はまだ同期していない。
 */
export const createMockCalendarSyncs = (now: Date): Schemas['CalendarSyncStatus'][] => {
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
  return [
    {
      external_calendar_id: 'calendar-1',
      staff_id: 'staff-1',
      staff_name: '青木 一郎',
      last_status: 'succeeded',
      last_succeeded_at: minutesAgo(1),
      last_error: null,
    },
    {
      external_calendar_id: 'calendar-2',
      staff_id: 'staff-2',
      staff_name: '石川 二葉',
      last_status: 'failed',
      last_succeeded_at: minutesAgo(30),
      last_error: 'unavailable',
    },
    {
      external_calendar_id: 'calendar-3',
      staff_id: 'staff-3',
      staff_name: '上田 三奈',
      last_status: 'never',
      last_succeeded_at: null,
      last_error: null,
    },
  ]
}

const nameOf = <T extends { id: string }>(rows: T[], id: string, name: (row: T) => string) => {
  const row = rows.find((r) => r.id === id)
  return row ? name(row) : ''
}

/** 予定の作成と置き換えのリクエストから、API が返す予定を組み立てる。名前はマスタと職員と利用者から引く。 */
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
    ends_next_day: body.ends_next_day ?? false,
    is_over_time_work: body.start_time >= '17:00',
    staff_id: body.staff_id,
    staff_name: nameOf(mockStaffList, body.staff_id, (s) => s.username),
    title: body.title ?? null,
    description: body.description ?? null,
    recurring_schedule_id: null,
    visit_info: visit
      ? {
          id: `visit-of-${id}`,
          patient_id: visit.patient_id,
          patient_name: nameOf(mockPatients, visit.patient_id, (p) => p.name),
          assigned_staff_id: visit.assigned_staff_id,
          assigned_staff_name: nameOf(mockStaffList, visit.assigned_staff_id, (s) => s.username),
          companion_id: visit.companion_id ?? null,
          companion_name: visit.companion_id
            ? nameOf(mockStaffList, visit.companion_id, (s) => s.username)
            : null,
          service_code_id: visit.service_code_id,
          service_code: nameOf(mockServiceCodes, visit.service_code_id, (c) => c.code),
          visit_categories: mockVisitCategories.filter((c) =>
            visit.visit_category_ids?.includes(c.id),
          ),
        }
      : null,
    cancel: null,
    source: 'buddy',
    review_reason: null,
    ...stamps,
  }
}

/** 職員がカレンダーを共有する相手として返す、ダミーのサービスアカウント。 */
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

/**
 * 確認が必要な書き出し。schedule-1 は buddy と Google カレンダーの両方で変わり、schedule-5 は書く権限が無く、
 * 繰り返しの予定 recurring-1 は Google カレンダーで消され、schedule-2 は Google カレンダーで終日の予定にされ、
 * schedule-4 は buddy でキャンセルした後に Google カレンダーで変えられていた。
 * Google カレンダーの内容に合わせられるのは schedule-1 だけである。
 */
export const mockExportIssues: Schemas['CalendarExportIssue'][] = [
  {
    id: 'export-1',
    schedule_id: 'schedule-1',
    recurring_schedule_id: null,
    status: 'conflict',
    error_code: 'precondition_failed',
    attempts: 1,
    updated_at: '2026-10-22T01:00:00Z',
    staff_id: 'staff-1',
    staff_name: '青木 一郎',
    date: '2026-11-04',
    start_time: '09:00',
    end_time: '09:29',
    ends_next_day: false,
    acceptable: true,
  },
  {
    id: 'export-2',
    schedule_id: 'schedule-5',
    recurring_schedule_id: null,
    status: 'failed',
    error_code: 'forbidden',
    attempts: 1,
    updated_at: '2026-10-21T23:30:00Z',
    staff_id: 'staff-1',
    staff_name: '青木 一郎',
    date: '2026-11-02',
    start_time: '14:00',
    end_time: '16:00',
    ends_next_day: false,
    acceptable: false,
  },
  {
    id: 'export-3',
    schedule_id: null,
    recurring_schedule_id: 'recurring-1',
    status: 'conflict',
    error_code: 'not_found',
    attempts: 1,
    updated_at: '2026-10-21T22:00:00Z',
    staff_id: 'staff-2',
    staff_name: '石川 二葉',
    date: '2026-11-03',
    start_time: '10:00',
    end_time: '11:00',
    ends_next_day: false,
    acceptable: false,
  },
  {
    id: 'export-4',
    schedule_id: 'schedule-2',
    recurring_schedule_id: null,
    status: 'conflict',
    error_code: 'unappliable',
    attempts: 0,
    updated_at: '2026-10-21T21:00:00Z',
    staff_id: 'staff-1',
    staff_name: '青木 一郎',
    date: '2026-11-05',
    start_time: '13:00',
    end_time: '14:00',
    ends_next_day: false,
    acceptable: false,
  },
  {
    id: 'export-5',
    schedule_id: 'schedule-4',
    recurring_schedule_id: null,
    status: 'conflict',
    error_code: 'precondition_failed',
    attempts: 1,
    updated_at: '2026-10-21T20:00:00Z',
    staff_id: 'staff-4',
    staff_name: '江藤 四郎',
    date: '2026-11-06',
    start_time: '15:00',
    end_time: '16:29',
    ends_next_day: false,
    acceptable: false,
  },
]

/** 確認が必要な書き出しから、予定の日時と職員を除いた書き出しを返す。 */
export const exportOfIssue = (
  issue: Schemas['CalendarExportIssue'],
): Schemas['CalendarExport'] => ({
  id: issue.id,
  schedule_id: issue.schedule_id,
  recurring_schedule_id: issue.recurring_schedule_id,
  status: issue.status,
  error_code: issue.error_code,
  attempts: issue.attempts,
  updated_at: issue.updated_at,
})

/** プレビューの結果。利用者を 1 人に決められない予定が 2 件（繰り返し 1 件）と、取り込まない予定が 3 件ある。 */
export const createMockImportPreview = (
  range: Schemas['ImportRange'],
): Schemas['ImportPreview'] => ({
  range_start: range.range_start,
  range_end: range.range_end ?? null,
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
    overwrite: 0,
  },
  needs_review: [
    {
      external_event_id: 'event-ambiguous',
      revision: 'rev-ambiguous',
      date: '2026-11-04',
      start_time: '10:00',
      end_time: '11:00',
      ends_next_day: false,
      service: '訪看I2',
      client_name: '加藤 春子',
      reason: 'patient_ambiguous',
      recurrence: {
        frequency: 'weekly',
        days_of_week: [3],
        interval: 1,
        day_of_week: null,
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
      revision: 'rev-missing',
      date: '2026-11-09',
      start_time: '14:00',
      end_time: '14:30',
      ends_next_day: false,
      service: '訪看I3',
      client_name: '架空 太郎',
      reason: 'patient_not_found',
      recurrence: null,
      candidates: [],
    },
  ],
  skipped: [
    {
      date: '2026-11-03',
      start_time: null,
      end_time: null,
      ends_next_day: false,
      all_day: true,
      reason: 'all_day',
    },
    {
      date: '2026-11-12',
      start_time: '17:00',
      end_time: '09:00',
      ends_next_day: false,
      all_day: false,
      reason: 'multi_day',
    },
    {
      date: '2026-11-20',
      start_time: '10:00',
      end_time: '10:30',
      ends_next_day: false,
      all_day: false,
      reason: 'service_not_found',
    },
  ],
})

/** 全て取り込み済みの期間のプレビューの結果。 */
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

/** プレビューの結果を、取り込み方を当てて確定した結果。取り込まないを選んだ予定は、取り込まなかった件数に足す。 */
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

/**
 * 予定の正本の切り替えの間のプレビューの結果。期間は終わりを持たず、2 日ごとの繰り返しの予定を、規則を buddy に写せない確認が必要な予定にする。
 * 取り込んだ後に Google で変わった予定が 1 件ある。
 */
export const createMockCutoverPreview = (rangeStart: string): Schemas['ImportPreview'] => {
  const preview = createMockImportPreview({ range_start: rangeStart, range_end: null })
  return {
    ...preview,
    counts: {
      ...preview.counts,
      expanded_occurrences: 0,
      recurring: 2,
      recurring_expanded: 0,
      needs_review: preview.counts.needs_review + 1,
      overwrite: 1,
    },
    needs_review: [
      ...preview.needs_review,
      {
        external_event_id: 'event-biweekly',
        revision: 'rev-biweekly',
        date: '2026-11-10',
        start_time: '16:00',
        end_time: '17:00',
        ends_next_day: false,
        service: '',
        client_name: '',
        reason: 'recurrence_unsupported',
        recurrence: null,
        candidates: [],
      },
    ],
  }
}
