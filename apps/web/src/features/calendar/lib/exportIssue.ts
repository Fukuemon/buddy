import type { CalendarExportIssue } from '#/api/types'

import { formatDateWithWeekday } from './format'

/** 確かめが要る予定の日時を「2026/11/04（水）10:00〜11:00」の形にする。繰り返しの予定は、最初の回の日付に「から毎回」を付ける。 */
export const formatExportIssueDateTime = (issue: CalendarExportIssue) => {
  const time = `${issue.start_time.slice(0, 5)}〜${issue.end_time.slice(0, 5)}`
  const date = formatDateWithWeekday(issue.date)
  return issue.recurring_schedule_id === null ? `${date}${time}` : `${date}から毎回 ${time}`
}

/** 確かめが要る書き出しの理由を、マネージャーが次にすることの分かる文にする。 */
export const exportIssueReason = (
  issue: Pick<
    CalendarExportIssue,
    'status' | 'error_code' | 'acceptable' | 'recurring_schedule_id'
  >,
) => {
  switch (issue.error_code) {
    case 'precondition_failed':
      if (issue.acceptable) {
        return 'buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。'
      }
      return issue.recurring_schedule_id === null
        ? 'buddy でキャンセルした予定が、Google カレンダーで変わっていました。buddy の内容で書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確かめてください。'
        : 'buddy と Google カレンダーの両方で繰り返しの予定が変わりました。buddy の内容で書き直すか、Google カレンダーで元に戻すよう職員に頼んでください。'
    case 'not_found':
      return 'Google カレンダーで予定が見つかりません。予定が消されたか、カレンダーの共有が外れていないかを、職員に確かめてください。'
    case 'unappliable':
      return 'Google カレンダーでの変更を、buddy の予定に読み替えられません。終日の予定、タイトルの利用者が見つからない予定、繰り返しの予定そのものの変更が当たります。buddy の内容で書き直すか、Google カレンダーで直すよう職員に頼んでください。'
    case 'rejected':
      return 'Google カレンダーが予定の内容を受け付けませんでした。予定を開いて内容を確かめてください。'
    case 'forbidden':
      return 'Google カレンダーに書けません。カレンダーが「予定の変更」の権限で共有されているかを、職員に確かめてください。'
    default:
      return issue.status === 'failed'
        ? 'Google カレンダーに届かず、書き出せませんでした。'
        : 'Google カレンダーに書き出せませんでした。'
  }
}
