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

  it('Google カレンダーに書けなかったときは、code ごとの文を出す', () => {
    const of = (code: string, status = 409) => new ApiError(status, 'message', [], code)
    expect(scheduleSubmitErrorMessage(of('google_event_changed'), '更新')).toBe(
      'Google カレンダーで予定が変更されていました。最新の予定を確認してから、もう一度保存してください。',
    )
    expect(scheduleSubmitErrorMessage(of('google_write_pending'), 'キャンセル')).toBe(
      '前の保存の結果を確認しています。時間をおいて、予定を開き直してください。',
    )
    expect(scheduleSubmitErrorMessage(of('calendar_not_linked'), '作成')).toBe(
      '予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、マネージャーに頼んでください。',
    )
    expect(scheduleSubmitErrorMessage(of('cutover_open'), '更新')).toBe(
      '予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。',
    )
    expect(scheduleSubmitErrorMessage(of('google_unavailable', 503), '作成')).toBe(
      'Google カレンダーに書けませんでした。時間をおいて、やり直してください。',
    )
  })

  it('Google カレンダーに書けたかを確認できないときは、作成なら送り直せることを、ほかの操作なら開き直すことを示す', () => {
    const error = new ApiError(503, 'unknown', [], 'google_write_unknown')
    expect(scheduleSubmitErrorMessage(error, '作成')).toBe(
      'Google カレンダーに書けたかを確認できませんでした。もう一度「作成」を押すと、同じ予定として送り直します。',
    )
    for (const verb of ['更新', 'キャンセル'] as const) {
      expect(scheduleSubmitErrorMessage(error, verb)).toBe(
        'Google カレンダーに書けたかを確認できませんでした。時間をおいて、予定を開き直してください。',
      )
    }
  })
})
