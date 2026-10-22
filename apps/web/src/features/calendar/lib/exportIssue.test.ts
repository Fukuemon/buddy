import { describe, expect, it } from 'vite-plus/test'

import { exportIssueReason } from './exportIssue'

describe('exportIssueReason', () => {
  it('理由ごとに、次にすることの分かる文を返す', () => {
    const conflict = { status: 'conflict', acceptable: false } as const
    const failed = { status: 'failed', acceptable: false } as const
    expect(
      exportIssueReason({ ...conflict, error_code: 'precondition_failed', acceptable: true }),
    ).toContain('どちらの内容に合わせるかを選んでください')
    expect(exportIssueReason({ ...conflict, error_code: 'precondition_failed' })).toContain(
      '繰り返しの予定が変わりました',
    )
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
