import { describe, expect, it } from 'vite-plus/test'

import { employmentText, formatRemainingRecurring, policyTargetText, statusLabel } from './format'

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
    }
    expect(formatRemainingRecurring(recurring)).toBe(
      '2026年10月6日（火）から終了日なし、10:00〜11:00',
    )
    expect(formatRemainingRecurring({ ...recurring, end_date: '2027-03-31' })).toBe(
      '2026年10月6日（火）から2027年3月31日（水）まで、10:00〜11:00',
    )
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
