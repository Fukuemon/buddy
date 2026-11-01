import { describe, expect, it } from 'vite-plus/test'

import type { StaffRecord } from '#/api/types'
import { mockStaff } from '#/mocks/scheduleData'

import {
  assignedStaffLabel,
  editStaffOptions,
  endedLabel,
  formatRemainingRecurring,
} from './format'

const staff: StaffRecord[] = [
  { ...mockStaff[0] },
  { ...mockStaff[1], status: 'on_leave' },
  { ...mockStaff[2], status: 'retired' },
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

  it('編集の担当の選択肢は、有効な職員だけを並べ、休職か退職の今の担当を先頭に足す', () => {
    expect(
      editStaffOptions({ assigned_staff_id: 'staff-3', assigned_staff_name: '上田 三奈' }, staff),
    ).toEqual([
      { id: 'staff-3', label: '上田 三奈（退職。今の担当）' },
      { id: 'staff-1', label: '青木 一郎' },
    ])
  })

  it('終了日の無い繰り返しの予定は、終了日なしと出す', () => {
    expect(
      formatRemainingRecurring({
        id: 'r-1',
        date: '2026-11-02',
        end_date: null,
        start_time: '09:00',
        end_time: '09:29',
      }),
    ).toBe('2026/11/02 から 終了日なし、09:00〜09:29')
  })
})
