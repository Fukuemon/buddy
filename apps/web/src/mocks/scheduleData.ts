import type { components } from '#/api/generated/schedule'

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

/** ログインした職員として GET /v1/me が返す職員。 */
export const mockMe: Schemas['StaffDetail'] = { ...mockStaff[0], sub: 'dev-aoki', policies: [] }

export const mockScheduleTypes: Schemas['ScheduleType'][] = [
  { id: 'type-normal', name: '通常' },
  { id: 'type-visit', name: '訪問' },
]

export const mockServiceCodes: Schemas['ServiceCode'][] = [
  { id: 'code-i2', code: '訪看I2', service_time_range_start: 20, service_time_range_end: 29 },
  { id: 'code-i3', code: '訪看I3', service_time_range_start: 30, service_time_range_end: 59 },
]

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
  const visit = (patientIndex: number, staffIndex: number): Partial<Schemas['Schedule']> => ({
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
      service_code_id: 'code-i2',
      service_code: '訪看I2',
      visit_categories: [],
    },
  })
  return [
    schedule('schedule-1', 0, 0, ['09:00', '09:29'], visit(0, 0)),
    schedule('schedule-2', 0, 1, ['10:30', '10:59'], visit(1, 1)),
    schedule('schedule-3', 0, 2, ['13:00', '14:00'], {
      title: 'カンファレンス',
      description: '事業所の会議室',
    }),
    schedule('schedule-4', 1, 3, ['09:30', '09:59'], visit(2, 3)),
    schedule('schedule-5', -1, 0, ['15:00', '16:00'], { title: '研修' }),
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
