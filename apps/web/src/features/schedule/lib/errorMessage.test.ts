import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '#/api/BuddyApi'

import { scheduleLoadErrorMessage, scheduleSubmitErrorMessage } from './errorMessage'

describe('scheduleLoadErrorMessage', () => {
  it('見つからないときと見る権限が無いときを、ほかの失敗と分ける', () => {
    expect(scheduleLoadErrorMessage(new ApiError(404, 'not found'))).toBe('予定が見つかりません。')
    expect(scheduleLoadErrorMessage(new ApiError(403, 'forbidden'))).toBe(
      'この予定を見る権限がありません。',
    )
    expect(scheduleLoadErrorMessage(new ApiError(500, 'internal'))).toBe(
      '予定を取得できませんでした。',
    )
    expect(scheduleLoadErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '予定を取得できませんでした。',
    )
  })
})

describe('scheduleSubmitErrorMessage', () => {
  it('権限が無いときと入力が規則に合わないときを、ほかの失敗と分ける', () => {
    expect(scheduleSubmitErrorMessage(new ApiError(403, 'forbidden'), '作成')).toBe(
      'この操作をする権限がありません。',
    )
    expect(scheduleSubmitErrorMessage(new ApiError(400, 'invalid'), '更新')).toBe(
      '入力の内容では予定を更新できません。内容を直してください。',
    )
    expect(scheduleSubmitErrorMessage(new ApiError(500, 'internal'), '作成')).toBe(
      '予定を作成できませんでした。',
    )
  })

  it('Google カレンダーを予定の正本にする事業所で拒まれたときは、Google カレンダーで作るよう示す', () => {
    const error = new ApiError(409, 'conflict', [], 'google_primary')
    for (const verb of ['作成', '更新'] as const) {
      expect(scheduleSubmitErrorMessage(error, verb)).toBe(
        'この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。',
      )
    }
  })
})
