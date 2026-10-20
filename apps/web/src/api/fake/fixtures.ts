import type { FacilityId, Patient, Schedule, Staff, Team, Viewer } from '../types'

/** 手元で使う架空の事業所。 */
export const FAKE_FACILITY_ID: FacilityId = 'facility-demo'

/** 偽物の API のときにログインしているとみなす職員。 */
export const FAKE_VIEWER: Viewer = {
  staffId: 'staff-1',
  staffName: '青木 一郎',
  facilityId: FAKE_FACILITY_ID,
}

export const fakeTeams: Team[] = [
  { id: 'team-a', name: 'A チーム' },
  { id: 'team-b', name: 'B チーム' },
]

export const fakeStaff: Staff[] = [
  { id: 'staff-1', name: '青木 一郎', teamId: 'team-a' },
  { id: 'staff-2', name: '石川 二葉', teamId: 'team-a' },
  { id: 'staff-3', name: '上田 三奈', teamId: 'team-b' },
  { id: 'staff-4', name: '江藤 四郎', teamId: 'team-b' },
]

export const fakePatients: Patient[] = [
  { id: 'patient-1', name: '加藤 春子' },
  { id: 'patient-2', name: '木村 夏夫' },
  { id: 'patient-3', name: '久保 秋代' },
  { id: 'patient-4', name: '小林 冬馬' },
]

const pad = (value: number) => String(value).padStart(2, '0')

/** 基準日から days 日後の hh:mm を、+09:00 の ISO 8601 で返す。 */
const at = (base: Date, days: number, time: string) => {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}:00+09:00`
}

/** 基準日の前後に散らした架空の予定を作る。 */
export const createFakeSchedules = (base: Date): Schedule[] => [
  {
    id: 'schedule-1',
    facilityId: FAKE_FACILITY_ID,
    kind: 'visit',
    title: '訪問',
    staffId: 'staff-1',
    startsAt: at(base, 0, '09:00'),
    endsAt: at(base, 0, '09:29'),
    description: '',
    visit: { patientId: 'patient-1', serviceCode: '訪看I2', categories: [] },
  },
  {
    id: 'schedule-2',
    facilityId: FAKE_FACILITY_ID,
    kind: 'visit',
    title: '訪問',
    staffId: 'staff-2',
    startsAt: at(base, 0, '10:30'),
    endsAt: at(base, 0, '11:29'),
    description: '',
    visit: { patientId: 'patient-2', serviceCode: '訪看I3', categories: ['emergency'] },
  },
  {
    id: 'schedule-3',
    facilityId: FAKE_FACILITY_ID,
    kind: 'normal',
    title: 'カンファレンス',
    staffId: 'staff-3',
    startsAt: at(base, 0, '13:00'),
    endsAt: at(base, 0, '14:00'),
    description: '事業所の会議室',
    visit: undefined,
  },
  {
    id: 'schedule-4',
    facilityId: FAKE_FACILITY_ID,
    kind: 'visit',
    title: '訪問',
    staffId: 'staff-4',
    startsAt: at(base, 1, '15:00'),
    endsAt: at(base, 1, '16:29'),
    description: '',
    visit: { patientId: 'patient-3', serviceCode: '訪看I4', categories: [] },
  },
  {
    id: 'schedule-5',
    facilityId: FAKE_FACILITY_ID,
    kind: 'normal',
    title: '研修',
    staffId: 'staff-1',
    startsAt: at(base, -2, '14:00'),
    endsAt: at(base, -2, '16:00'),
    description: '',
    visit: undefined,
  },
]
