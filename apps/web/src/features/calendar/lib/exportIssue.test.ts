import { describe, expect, it } from 'vite-plus/test'

import { exportIssueReason, isCancelledSingleIssue } from './exportIssue'

describe('exportIssueReason', () => {
  const conflict = { status: 'conflict', acceptable: false, recurring_schedule_id: null } as const
  const failed = { status: 'failed', acceptable: false, recurring_schedule_id: null } as const

  describe('両方で変わった予定', () => {
    it('Google の内容に合わせられる単発の予定は、どちらに合わせるかを選ばせる', () => {
      expect(
        exportIssueReason({ ...conflict, error_code: 'precondition_failed', acceptable: true }),
      ).toBe(
        'buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。',
      )
    })

    it('Google の内容に合わせられない単発の予定は、buddy でキャンセルした予定として、書き直すと消えることを示す', () => {
      expect(exportIssueReason({ ...conflict, error_code: 'precondition_failed' })).toBe(
        'buddy でキャンセルした予定が、Google カレンダーで変わっていました。buddy の内容で書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確かめてください。',
      )
    })

    it('繰り返しの予定は、書き直すか元に戻すよう頼ませる', () => {
      expect(
        exportIssueReason({
          ...conflict,
          error_code: 'precondition_failed',
          recurring_schedule_id: 'recurring-1',
        }),
      ).toBe(
        'buddy と Google カレンダーの両方で繰り返しの予定が変わりました。buddy の内容で書き直すか、Google カレンダーで元に戻すよう職員に頼んでください。',
      )
    })
  })

  it('ほかの理由ごとに、次にすることの分かる文を返す', () => {
    expect(exportIssueReason({ ...conflict, error_code: 'not_found' })).toContain(
      'カレンダーの共有が外れていないか',
    )
    expect(exportIssueReason({ ...conflict, error_code: 'unappliable' })).toContain(
      'buddy の予定に読み替えられません',
    )
    expect(exportIssueReason({ ...failed, error_code: 'forbidden' })).toContain(
      '「予定の変更」の権限で共有されているか',
    )
    expect(exportIssueReason({ ...failed, error_code: 'rejected' })).toContain(
      '予定の内容を受け付けませんでした',
    )
    expect(exportIssueReason({ ...failed, error_code: 'unavailable' })).toBe(
      'Google カレンダーに届かず、書き出せませんでした。',
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
