import { describe, expect, it } from 'vite-plus/test'

import { mockExportIssues } from '#/mocks/scheduleData'

import {
  exportIssueReason,
  exportIssueReasonDetail,
  formatExportIssueDateTime,
  isCancelledSingleIssue,
} from './exportIssue'

const conflict = { status: 'conflict', acceptable: false, recurring_schedule_id: null } as const
const failed = { status: 'failed', acceptable: false, recurring_schedule_id: null } as const

describe('exportIssueReason', () => {
  describe('両方で変わった予定', () => {
    it('Google の内容に合わせられる単発の予定は、両方で変わったことを示す', () => {
      expect(
        exportIssueReason({ ...conflict, error_code: 'precondition_failed', acceptable: true }),
      ).toBe('buddy と Google カレンダーの両方で予定が変わりました。')
    })

    it('Google の内容に合わせられない単発の予定は、buddy でキャンセルした予定として示す', () => {
      expect(exportIssueReason({ ...conflict, error_code: 'precondition_failed' })).toBe(
        'buddy でキャンセルした予定が、Google カレンダーで変わっていました。',
      )
    })

    it('繰り返しの予定は、繰り返しの予定が変わったことを示す', () => {
      expect(
        exportIssueReason({
          ...conflict,
          error_code: 'precondition_failed',
          recurring_schedule_id: 'recurring-1',
        }),
      ).toBe('buddy と Google カレンダーの両方で繰り返しの予定が変わりました。')
    })
  })

  it('ほかの理由ごとに、何が起きたかの 1 文を返す', () => {
    expect(exportIssueReason({ ...conflict, error_code: 'not_found' })).toBe(
      'Google カレンダーで予定が見つかりません。',
    )
    expect(exportIssueReason({ ...conflict, error_code: 'unappliable' })).toBe(
      'Google カレンダーでの変更を、buddy の予定として取り込めません。',
    )
    expect(exportIssueReason({ ...conflict, error_code: 'not_buddy_primary' })).toBe(
      'この事業所の予定は Google カレンダーで管理しているので、書き出していません。',
    )
    expect(exportIssueReason({ ...failed, error_code: 'forbidden' })).toBe(
      'Google カレンダーに書けません。',
    )
    expect(exportIssueReason({ ...failed, error_code: 'rejected' })).toBe(
      'Google カレンダーが予定の内容を受け付けませんでした。',
    )
    expect(exportIssueReason({ ...failed, error_code: 'unavailable' })).toBe(
      'Google カレンダーに届かず、書き出せませんでした。',
    )
  })
})

describe('exportIssueReasonDetail', () => {
  it('ボタンで足りる理由には、続きの文を返さない', () => {
    expect(
      exportIssueReasonDetail({ ...conflict, error_code: 'precondition_failed', acceptable: true }),
    ).toBeUndefined()
    expect(exportIssueReasonDetail({ ...failed, error_code: 'rejected' })).toBeUndefined()
    expect(exportIssueReasonDetail({ ...failed, error_code: 'unavailable' })).toBeUndefined()
  })

  it('職員に確認するか頼むことを、理由ごとに返す', () => {
    expect(exportIssueReasonDetail({ ...conflict, error_code: 'precondition_failed' })).toBe(
      '書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。',
    )
    expect(
      exportIssueReasonDetail({
        ...conflict,
        error_code: 'precondition_failed',
        recurring_schedule_id: 'recurring-1',
      }),
    ).toBe('Google カレンダーで元に戻すときは、職員に頼んでください。')
    expect(exportIssueReasonDetail({ ...conflict, error_code: 'not_found' })).toContain(
      'カレンダーの共有が外れていないか',
    )
    expect(exportIssueReasonDetail({ ...conflict, error_code: 'unappliable' })).toContain(
      'Google カレンダーで直すときは、職員に頼んでください。',
    )
    expect(exportIssueReasonDetail({ ...failed, error_code: 'forbidden' })).toContain(
      '「予定の変更」の権限で共有されているか',
    )
  })
})

describe('isCancelledSingleIssue', () => {
  const issue = {
    status: 'conflict',
    error_code: 'precondition_failed',
    acceptable: false,
    recurring_schedule_id: null,
  } as const

  it('Google カレンダーで変わったか消えた単発の予定で、合わせられなければ、キャンセルした予定とみなす', () => {
    expect(isCancelledSingleIssue(issue)).toBe(true)
    expect(isCancelledSingleIssue({ ...issue, error_code: 'not_found' })).toBe(true)
  })

  it('合わせられる予定、繰り返しの予定、ほかの理由の予定は、キャンセルした予定とみなさない', () => {
    expect(isCancelledSingleIssue({ ...issue, acceptable: true })).toBe(false)
    expect(isCancelledSingleIssue({ ...issue, recurring_schedule_id: 'recurring-1' })).toBe(false)
    expect(isCancelledSingleIssue({ ...issue, error_code: 'unappliable' })).toBe(false)
    expect(isCancelledSingleIssue({ ...issue, status: 'failed', error_code: 'forbidden' })).toBe(
      false,
    )
  })
})

describe('formatExportIssueDateTime', () => {
  const issue = mockExportIssues[0]!
  it('単発の予定は日付と時刻の範囲にする', () => {
    expect(
      formatExportIssueDateTime({
        ...issue,
        date: '2026-11-04',
        start_time: '10:00',
        end_time: '11:00',
      }),
    ).toBe('2026/11/04（水）10:00〜11:00')
  })
  it('終了が翌日の予定は、終了の時刻に「翌」を付ける', () => {
    expect(
      formatExportIssueDateTime({
        ...issue,
        date: '2026-11-04',
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    ).toBe('2026/11/04（水）22:00〜翌 01:00')
  })
})
