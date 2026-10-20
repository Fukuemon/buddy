import { describe, expect, it } from 'vite-plus/test'

import type { ScheduleInput } from '../types'
import {
  type ApiSchedule,
  type ScheduleMasters,
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
  is_over_time_work: false,
  staff_id: 'staff-1',
  staff_name: '青木 一郎',
  title: '会議',
  description: null,
  recurring_schedule_id: null,
  visit_info: null,
  cancel: null,
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

  it('全角の数字のサービスコードも画面の表記に読み替える', () => {
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
    ).toBe('訪看I2')
  })

  it('画面が知らないサービスコードなら Error を投げる', () => {
    const visitInfo = {
      id: 'visit-1',
      patient_id: 'patient-1',
      patient_name: '',
      assigned_staff_id: 'staff-1',
      assigned_staff_name: '',
      companion_id: null,
      companion_name: null,
      service_code_id: 'code-x',
      service_code: '未知',
      visit_categories: [],
    }
    expect(() =>
      fromApiSchedule(apiSchedule({ schedule_type: '訪問', visit_info: visitInfo })),
    ).toThrow('未知')
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

  it('日付をまたぐ予定と、マスタにない値は Error を投げる', () => {
    expect(() =>
      toSlotRequest({ ...normal, endsAt: '2026-10-21T01:00:00+09:00' }, masters),
    ).toThrow('日付をまたぐ')
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
