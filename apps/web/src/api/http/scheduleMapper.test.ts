import { describe, expect, it } from 'vite-plus/test'

import type { ScheduleInput } from '../types'
import {
  type ApiSchedule,
  type ScheduleMasters,
  fromApiFacility,
  fromApiMe,
  fromApiSchedule,
  splitDateTime,
  toSlotRequest,
} from './scheduleMapper'

const apiSchedule = (overrides: Partial<ApiSchedule> = {}): ApiSchedule => ({
  id: 'schedule-1',
  facility_id: 'facility-1',
  schedule_type_id: 'type-normal',
  schedule_type: '通常',
  date: '2026-10-20',
  start_time: '09:00',
  end_time: '10:30',
  ends_next_day: false,
  is_over_time_work: false,
  staff_id: 'staff-1',
  staff_name: '青木 一郎',
  title: '会議',
  description: null,
  recurring_schedule_id: null,
  visit_info: null,
  cancel: null,
  source: 'buddy',
  review_reason: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

const masters: ScheduleMasters = {
  scheduleTypes: [
    { id: 'type-normal', name: '通常' },
    { id: 'type-visit', name: '訪問' },
  ],
  serviceCodes: [
    { id: 'code-i2', code: '訪看I2', service_time_range_start: 20, service_time_range_end: 29 },
  ],
  visitCategories: [
    { id: 'category-night', name: '夜勤' },
    { id: 'category-emergency', name: '緊急' },
  ],
}

describe('fromApiSchedule', () => {
  it('通常の予定の種類、日付と時刻、null の項目を画面の値にする', () => {
    expect(fromApiSchedule(apiSchedule())).toEqual({
      id: 'schedule-1',
      facilityId: 'facility-1',
      kind: 'normal',
      title: '会議',
      staffId: 'staff-1',
      startsAt: '2026-10-20T09:00:00+09:00',
      endsAt: '2026-10-20T10:30:00+09:00',
      description: '',
    })
  })

  it('終了が翌日の印が付いた予定は、終了の日時を翌日にする', () => {
    const schedule = fromApiSchedule(
      apiSchedule({
        date: '2026-10-31',
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    )
    expect(schedule.startsAt).toBe('2026-10-31T22:00:00+09:00')
    expect(schedule.endsAt).toBe('2026-11-01T01:00:00+09:00')
  })

  it('キャンセルした予定は、キャンセルの理由を持つ', () => {
    expect(
      fromApiSchedule(
        apiSchedule({ cancel: { id: 'c', schedule_id: 'schedule-1', reason: '体調不良' } }),
      ).cancel,
    ).toEqual({ reason: '体調不良' })
  })

  it('Google カレンダーの予定は印を持ち、確認が必要な予定は理由を持つ', () => {
    const schedule = fromApiSchedule(
      apiSchedule({ source: 'google_calendar', review_reason: 'patient_not_found' }),
    )
    expect(schedule.fromGoogleCalendar).toBe(true)
    expect(schedule.reviewReason).toBe('patient_not_found')
    const plain = fromApiSchedule(apiSchedule({ source: 'google_calendar' }))
    expect(plain.fromGoogleCalendar).toBe(true)
    expect(plain).not.toHaveProperty('reviewReason')
  })

  it('訪問の予定は訪問の情報を持つ', () => {
    const schedule = fromApiSchedule(
      apiSchedule({
        schedule_type: '訪問',
        title: null,
        visit_info: {
          id: 'visit-1',
          patient_id: 'patient-1',
          patient_name: '加藤 春子',
          assigned_staff_id: 'staff-1',
          assigned_staff_name: '青木 一郎',
          companion_id: null,
          companion_name: null,
          service_code_id: 'code-i2',
          service_code: '訪看I2',
          visit_categories: [{ id: 'category-night', name: '夜勤' }],
        },
      }),
    )
    expect(schedule.kind).toBe('visit')
    expect(schedule.title).toBe('')
    expect(schedule.visit).toEqual({
      patientId: 'patient-1',
      serviceCode: '訪看I2',
      categories: ['night'],
    })
  })

  it('サービスコードは、全角の数字でも予定の API の表記のまま使う', () => {
    const visitInfo = {
      id: 'visit-1',
      patient_id: 'patient-1',
      patient_name: '',
      assigned_staff_id: 'staff-1',
      assigned_staff_name: '',
      companion_id: null,
      companion_name: null,
      service_code_id: 'code-i2',
      service_code: '訪看I２',
      visit_categories: [],
    }
    expect(
      fromApiSchedule(apiSchedule({ schedule_type: '訪問', visit_info: visitInfo })).visit
        ?.serviceCode,
    ).toBe('訪看I２')
  })
})

describe('fromApiFacility', () => {
  it('事業所の ID、名前、予定の管理先を画面の値にする', () => {
    expect(
      fromApiFacility({
        id: 'facility-1',
        name: '事業所',
        source_mode: 'google_primary',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      }),
    ).toEqual({ id: 'facility-1', name: '事業所', sourceMode: 'google_primary' })
  })
})

describe('splitDateTime', () => {
  it('ほかのオフセットの日時を +09:00 の日付と時刻にする', () => {
    expect(splitDateTime('2026-10-20T15:30:00Z')).toEqual({ date: '2026-10-21', time: '00:30' })
    expect(splitDateTime('2026-10-20T09:05:00+09:00')).toEqual({
      date: '2026-10-20',
      time: '09:05',
    })
  })

  it('読めない日時なら Error を投げる', () => {
    expect(() => splitDateTime('not a date')).toThrow('not a date')
  })
})

describe('toSlotRequest', () => {
  const normal: ScheduleInput = {
    kind: 'normal',
    title: '研修',
    staffId: 'staff-2',
    startsAt: '2026-10-20T15:00:00+09:00',
    endsAt: '2026-10-20T16:00:00+09:00',
    description: '',
  }

  it('通常の予定を、種類の ID、日付と時刻、null の項目にする', () => {
    expect(toSlotRequest(normal, masters)).toEqual({
      schedule_type_id: 'type-normal',
      date: '2026-10-20',
      start_time: '15:00',
      end_time: '16:00',
      ends_next_day: false,
      staff_id: 'staff-2',
      title: '研修',
      description: null,
      visit_info: null,
    })
  })

  it('訪問の予定のサービスコードと区分を、マスタの ID にする', () => {
    const body = toSlotRequest(
      {
        ...normal,
        kind: 'visit',
        title: '',
        visit: {
          patientId: 'patient-1',
          serviceCode: '訪看I2',
          categories: ['night', 'emergency'],
        },
      },
      masters,
    )
    expect(body.schedule_type_id).toBe('type-visit')
    expect(body.title).toBeNull()
    expect(body.visit_info).toEqual({
      patient_id: 'patient-1',
      assigned_staff_id: 'staff-2',
      companion_id: null,
      service_code_id: 'code-i2',
      visit_category_ids: ['category-night', 'category-emergency'],
    })
  })

  it('終了が開始の翌日の予定は、開始の日付と終了の時刻に、翌日の印を付ける', () => {
    expect(
      toSlotRequest(
        { ...normal, startsAt: '2026-10-20T22:00:00+09:00', endsAt: '2026-10-21T01:00:00+09:00' },
        masters,
      ),
    ).toMatchObject({
      date: '2026-10-20',
      start_time: '22:00',
      end_time: '01:00',
      ends_next_day: true,
    })
    expect(
      toSlotRequest(
        { ...normal, startsAt: '2026-10-20T23:00:00+09:00', endsAt: '2026-10-21T00:00:00+09:00' },
        masters,
      ),
    ).toMatchObject({ end_time: '00:00', ends_next_day: true })
  })

  it('長さが 0 以下か 24 時間以上の予定と、マスタにない値は Error を投げる', () => {
    expect(() =>
      toSlotRequest({ ...normal, endsAt: '2026-10-21T15:00:00+09:00' }, masters),
    ).toThrow('24 時間未満')
    expect(() =>
      toSlotRequest({ ...normal, endsAt: '2026-10-20T15:00:00+09:00' }, masters),
    ).toThrow('24 時間未満')
    expect(() =>
      toSlotRequest(
        {
          ...normal,
          kind: 'visit',
          visit: { patientId: 'patient-1', serviceCode: '医', categories: [] },
        },
        masters,
      ),
    ).toThrow('医')
  })
})

describe('fromApiMe', () => {
  const ref = { id: 'ref-1', name: '名前' }
  const policy = (code: string, targetUserIds: string[] = []) => ({
    user_policy_id: `up-${code}`,
    policy_id: `p-${code}`,
    code,
    name: code,
    target_user_ids: targetUserIds,
    target_team_ids: [],
  })
  const me = (policies: ReturnType<typeof policy>[]) => ({
    id: 'staff-1',
    username: '青木 陽菜',
    email: null,
    phone_number: null,
    facility_id: 'facility-1',
    department: ref,
    team: ref,
    position: ref,
    visits: true,
    status: 'active' as const,
    leave_started_at: null,
    leave_return_date: null,
    retired_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sub: null,
    policies,
  })

  it('権限のコードをそのまま写し、予定の権限を対象とともに作る', () => {
    expect(
      fromApiMe(
        me([policy('staff.manage'), policy('schedule.user.read', ['staff-2']), policy('x.y')]),
      ),
    ).toEqual({
      staffId: 'staff-1',
      staffName: '青木 陽菜',
      facilityId: 'facility-1',
      policyCodes: ['staff.manage', 'schedule.user.read', 'x.y'],
      schedulePolicies: [
        { code: 'schedule.user.read', targetStaffIds: ['staff-2'], targetTeamIds: [] },
      ],
    })
  })

  it('権限が無ければ、権限のコードの一覧を空にする', () => {
    expect(fromApiMe(me([]))).toMatchObject({
      policyCodes: [],
      schedulePolicies: [],
    })
  })
})
