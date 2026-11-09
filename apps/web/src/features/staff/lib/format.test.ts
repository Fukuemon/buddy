import { describe, expect, it } from 'vite-plus/test'

import {
  employmentText,
  formatRemainingRecurring,
  formatRemainingRecurringParts,
  formatRemainingSchedule,
  formatRemainingScheduleParts,
  policyTargetText,
  statusLabel,
} from './format'

const active = {
  status: 'active',
  leave_started_at: null,
  leave_return_date: null,
  retired_at: null,
} as const

describe('statusLabel', () => {
  it('休職は戻る予定の日を、退職は事業所の現地の日付の退職にした日を添える', () => {
    expect(statusLabel(active)).toBe('有効')
    expect(statusLabel({ ...active, status: 'on_leave', leave_return_date: '2027-04-01' })).toBe(
      '休職（2027年4月1日（木）に戻る予定）',
    )
    expect(statusLabel({ ...active, status: 'on_leave' })).toBe('休職')
    expect(statusLabel({ ...active, status: 'retired', retired_at: '2026-09-30T15:00:00Z' })).toBe(
      '退職（2026年10月1日（木））',
    )
  })
})

describe('employmentText', () => {
  it('休職は休職にした日を書き、戻る予定の日が無ければ 2 つ目の文を省き、有効には文を出さない', () => {
    const onLeave = {
      ...active,
      status: 'on_leave',
      leave_started_at: '2026-10-31T01:00:00Z',
    } as const
    expect(employmentText(onLeave)).toBe('2026年10月31日（土）から休職です。')
    expect(employmentText({ ...onLeave, leave_return_date: '2027-04-01' })).toBe(
      '2026年10月31日（土）から休職です。戻る予定の日に自動では戻りません。',
    )
    expect(employmentText(active)).toBeUndefined()
  })
})

describe('formatRemainingRecurring', () => {
  it('終了日が無ければ「終了日なし」にする', () => {
    const recurring = {
      id: 'r',
      date: '2026-10-06',
      end_date: null,
      start_time: '10:00',
      end_time: '11:00',
      ends_next_day: false,
    }
    expect(formatRemainingRecurring(recurring)).toBe(
      '2026年10月6日（火）から終了日なし、10:00〜11:00',
    )
    expect(formatRemainingRecurring({ ...recurring, end_date: '2027-03-31' })).toBe(
      '2026年10月6日（火）から2027年3月31日（水）まで、10:00〜11:00',
    )
  })

  it('翌日に終わる繰り返しは、終了の時刻に「翌」を付ける', () => {
    expect(
      formatRemainingRecurring({
        id: 'r',
        date: '2026-10-06',
        end_date: null,
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    ).toBe('2026年10月6日（火）から終了日なし、22:00〜翌 01:00')
  })
})

describe('formatRemainingSchedule', () => {
  const schedule = {
    id: 's',
    date: '2026-11-02',
    start_time: '22:00',
    end_time: '01:00',
    ends_next_day: true,
  }

  it('翌日に終わる予定は、終了の時刻に「翌」を付ける', () => {
    expect(formatRemainingSchedule(schedule)).toBe('2026年11月2日（月） 22:00〜翌 01:00')
  })

  it('同じ日に終わる予定は、「翌」を付けない', () => {
    expect(
      formatRemainingSchedule({
        ...schedule,
        start_time: '09:00',
        end_time: '10:00',
        ends_next_day: false,
      }),
    ).toBe('2026年11月2日（月） 09:00〜10:00')
  })
})

describe('formatRemainingScheduleParts と formatRemainingRecurringParts', () => {
  it('画面が時刻の範囲の中で折り返さないよう、時刻の範囲を「翌」と終了の時刻まで 1 つにして返す', () => {
    expect(
      formatRemainingScheduleParts({
        id: 's',
        date: '2026-11-02',
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    ).toEqual({ date: '2026年11月2日（月）', time: '22:00〜翌 01:00' })
    expect(
      formatRemainingRecurringParts({
        id: 'r',
        date: '2026-10-06',
        end_date: '2027-03-31',
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    ).toEqual({
      period: '2026年10月6日（火）から2027年3月31日（水）まで、',
      time: '22:00〜翌 01:00',
    })
  })
})

describe('policyTargetText', () => {
  it('対象の名前を「、」でつなぎ、対象が無ければ空にする', () => {
    const names = new Map([
      ['staff-1', '森 健太'],
      ['staff-2', '佐藤 美咲'],
    ])
    expect(
      policyTargetText({ target_user_ids: ['staff-1', 'staff-2'], target_team_ids: [] }, names),
    ).toBe('森 健太、佐藤 美咲')
    expect(policyTargetText({ target_user_ids: [], target_team_ids: [] }, names)).toBe('')
  })
})
