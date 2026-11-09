import { describe, expect, it } from 'vite-plus/test'

import type { StaffRecord } from '#/api/types'
import { mockStaffList } from '#/mocks/scheduleData'

import {
  activeStaffOptions,
  assignedStaffLabel,
  editStaffOptions,
  endedLabel,
  formatRemainingRecurring,
  formatRemainingSchedule,
} from './format'

const staffList: StaffRecord[] = [
  { ...mockStaffList[0] },
  { ...mockStaffList[1], status: 'on_leave' },
  { ...mockStaffList[2], status: 'retired' },
  { ...mockStaffList[3], visits: false },
]

describe('format', () => {
  it('利用の終了の印は、事業所の現地の日付で出し、利用中なら出さない', () => {
    expect(endedLabel({ ended_at: '2026-09-30T15:30:00Z' })).toBe(
      '利用の終了（2026年10月1日（木））',
    )
    expect(endedLabel({ ended_at: null })).toBeUndefined()
  })

  it('担当の職員が休職か退職なら、名前の後ろに状態を括弧で付ける', () => {
    const of = (id: string, name: string) =>
      assignedStaffLabel({ assigned_staff_id: id, assigned_staff_name: name }, staffList)
    expect(of('staff-1', '青木 一郎')).toBe('青木 一郎')
    expect(of('staff-2', '石川 二葉')).toBe('石川 二葉（休職）')
    expect(of('staff-3', '上田 三奈')).toBe('上田 三奈（退職）')
  })

  it('担当の候補は、有効で訪問する職員だけを名前の順に並べる', () => {
    expect(activeStaffOptions(staffList).map((s) => s.id)).toEqual(['staff-1'])
  })

  it('編集の担当の選択肢は、有効で訪問する職員だけを並べ、休職か退職の今の担当を先頭に足す', () => {
    expect(
      editStaffOptions(
        { assigned_staff_id: 'staff-3', assigned_staff_name: '上田 三奈' },
        staffList,
      ),
    ).toEqual([
      { id: 'staff-3', label: '上田 三奈（退職。今の担当）' },
      { id: 'staff-1', label: '青木 一郎' },
    ])
  })

  it('編集の担当の選択肢は、訪問しない今の担当も先頭に足す', () => {
    expect(
      editStaffOptions(
        { assigned_staff_id: 'staff-4', assigned_staff_name: '江藤 四郎' },
        staffList,
      ),
    ).toEqual([
      { id: 'staff-4', label: '江藤 四郎（訪問しない。今の担当）' },
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
        ends_next_day: false,
      }),
    ).toBe('2026年11月2日（月）から終了日なし、09:00〜09:29')
  })

  it('翌日に終わる繰り返しの予定は、終了の時刻に「翌」を付ける', () => {
    expect(
      formatRemainingRecurring({
        id: 'r-1',
        date: '2026-11-02',
        end_date: '2027-03-31',
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    ).toBe('2026年11月2日（月）から2027年3月31日（水）まで、22:00〜翌 01:00')
  })

  it('翌日に終わる単発の予定は、終了の時刻に「翌」を付け、同じ日に終わる予定は付けない', () => {
    const schedule = {
      id: 's-1',
      date: '2026-11-02',
      start_time: '22:00',
      end_time: '01:00',
      ends_next_day: true,
    }
    expect(formatRemainingSchedule(schedule)).toBe('2026年11月2日（月） 22:00〜翌 01:00')
    expect(
      formatRemainingSchedule({
        ...schedule,
        start_time: '09:00',
        end_time: '09:29',
        ends_next_day: false,
      }),
    ).toBe('2026年11月2日（月） 09:00〜09:29')
  })
})
