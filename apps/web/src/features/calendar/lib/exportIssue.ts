import type { CalendarExportIssue } from '#/api/types'

import { formatDateWithWeekday } from './format'

/** 確かめが要る予定の日時を「2026/11/04（水）10:00〜11:00」の形にする。繰り返しの予定は、最初の回の日付に「から毎回」を付ける。 */
export const formatExportIssueDateTime = (issue: CalendarExportIssue) => {
  const time = `${issue.start_time.slice(0, 5)}〜${issue.end_time.slice(0, 5)}`
  const date = formatDateWithWeekday(issue.date)
  return issue.recurring_schedule_id === null ? `${date}${time}` : `${date}から毎回 ${time}`
}

/** 確かめが要る書き出しの理由を、マネージャーが次にすることの分かる文にする。 */
export const exportIssueReason = (issue: Pick<CalendarExportIssue, 'status' | 'error_code'>) => {
  switch (issue.error_code) {
    case 'precondition_failed':
      return 'Google カレンダーで予定が直されたので、buddy の変更を書き出していません。'
    case 'not_found':
      return 'Google カレンダーで予定が消されたので、buddy の変更を書き出していません。'
    case 'forbidden':
      return 'Google カレンダーに書けません。カレンダーが「予定の変更」の権限で共有されているかを、職員に確かめてください。'
    default:
      return issue.status === 'failed'
        ? 'Google カレンダーに届かず、書き出せませんでした。'
        : 'Google カレンダーに書き出せませんでした。'
  }
}
