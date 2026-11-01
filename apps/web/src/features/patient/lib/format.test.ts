import { describe, expect, it } from 'vite-plus/test'

import type { StaffRecord } from '#/api/types'
import { mockStaff } from '#/mocks/scheduleData'

import { activeStaffOptions, assignedStaffLabel, endedLabel } from './format'

const staff: StaffRecord[] = [
  { ...mockStaff[0] },
  { ...mockStaff[1], status: 'on_leave' },
  { ...mockStaff[2], status: 'retired' },
  { ...mockStaff[3], visits: false },
]

describe('format', () => {
  it('利用の終了の印は、事業所の現地の日付で出し、利用中なら出さない', () => {
    expect(endedLabel({ ended_at: '2026-09-30T15:30:00Z' })).toBe('利用の終了（2026/10/01）')
    expect(endedLabel({ ended_at: null })).toBeUndefined()
  })

  it('担当の職員が休職か退職なら、名前の後ろに状態を括弧で付ける', () => {
    const of = (id: string, name: string) =>
      assignedStaffLabel({ assigned_staff_id: id, assigned_staff_name: name }, staff)
    expect(of('staff-1', '青木 一郎')).toBe('青木 一郎')
    expect(of('staff-2', '石川 二葉')).toBe('石川 二葉（休職）')
    expect(of('staff-3', '上田 三奈')).toBe('上田 三奈（退職）')
  })

  it('担当の候補は、有効で訪問する職員だけを名前の順に並べる', () => {
    expect(activeStaffOptions(staff).map((s) => s.id)).toEqual(['staff-1'])
  })
})
