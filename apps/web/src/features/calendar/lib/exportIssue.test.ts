import { describe, expect, it } from 'vite-plus/test'

import { exportIssueReason } from './exportIssue'

describe('exportIssueReason', () => {
  it('理由ごとに、次にすることの分かる文を返す', () => {
    expect(exportIssueReason({ status: 'conflict', error_code: 'precondition_failed' })).toContain(
      'Google カレンダーで予定が直された',
    )
    expect(exportIssueReason({ status: 'conflict', error_code: 'not_found' })).toContain(
      'Google カレンダーで予定が消された',
    )
    expect(exportIssueReason({ status: 'failed', error_code: 'forbidden' })).toContain(
      '「予定の変更」の権限で共有されているか',
    )
    expect(exportIssueReason({ status: 'failed', error_code: 'unavailable' })).toBe(
      'Google カレンダーに届かず、書き出せませんでした。',
    )
  })
})
