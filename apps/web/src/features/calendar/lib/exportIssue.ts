import type { CalendarExportIssue } from '#/api/types'

import { formatDateKey, formatTimeRange } from '#/components/dateFormat'

type ExportIssueState = Pick<
  CalendarExportIssue,
  'status' | 'error_code' | 'acceptable' | 'recurring_schedule_id'
>

/**
 * 確認が必要な予定の日時を、日付の側（「2026年11月4日（水）」、繰り返しは「2026年11月3日（火）から毎回」）と
 * 時刻の範囲（「10:00〜11:00」、終了が翌日なら「22:00〜翌 01:00」）に分けて返す。表が時刻の範囲を 1 行に保つのに使う。
 */
export const formatExportIssueDateTimeParts = (issue: CalendarExportIssue) => {
  const date = formatDateKey(issue.date)
  return {
    date: issue.recurring_schedule_id === null ? date : `${date}から毎回`,
    time: formatTimeRange(
      issue.start_time,
      issue.end_time,
      issue.ends_next_day ? 'nextDay' : 'sameDay',
    ),
  }
}

/**
 * 確認が必要な予定の日時を「2026年11月4日（水） 10:00〜11:00」の形にする。終了が翌日の予定は「22:00〜翌 01:00」にする。
 * 繰り返しの予定は、最初の回の日付に「から毎回」を付ける。
 */
export const formatExportIssueDateTime = (issue: CalendarExportIssue) => {
  const { date, time } = formatExportIssueDateTimeParts(issue)
  return `${date} ${time}`
}

/**
 * 確認が必要な書き出しが、buddy でキャンセルした単発の予定かを返す。buddy の内容で書き直すと、Google カレンダーの予定を消す。
 * API の `acceptable` は、Google カレンダーで変わったか消えた単発の予定（`conflict` の `precondition_failed` か `not_found`）では、buddy でキャンセルしたときだけ false になる。
 */
export const isCancelledSingleIssue = (issue: ExportIssueState) =>
  issue.status === 'conflict' &&
  (issue.error_code === 'precondition_failed' || issue.error_code === 'not_found') &&
  !issue.acceptable &&
  issue.recurring_schedule_id === null

/** 確認が必要な書き出しの理由を、何が起きたかの 1 文にする。次にすることは、ダイアログのボタンと exportIssueReasonDetail が示す。 */
export const exportIssueReason = (issue: ExportIssueState) => {
  switch (issue.error_code) {
    case 'precondition_failed':
      if (issue.acceptable) return 'buddy と Google カレンダーの両方で予定が変わりました。'
      return isCancelledSingleIssue(issue)
        ? 'buddy でキャンセルした予定が、Google カレンダーで変わっていました。'
        : 'buddy と Google カレンダーの両方で繰り返しの予定が変わりました。'
    case 'not_found':
      return 'Google カレンダーで予定が見つかりません。'
    case 'unappliable':
      return 'Google カレンダーでの変更を、buddy の予定として取り込めません。'
    case 'rejected':
      return 'Google カレンダーが予定の内容を受け付けませんでした。'
    case 'forbidden':
      return 'Google カレンダーに書けません。'
    case 'not_buddy_primary':
      return 'この事業所の予定は Google カレンダーで管理しているので、書き出していません。'
    default:
      return issue.status === 'failed'
        ? 'Google カレンダーに届かず、書き出せませんでした。'
        : 'Google カレンダーに書き出せませんでした。'
  }
}

/**
 * 予定の確認のダイアログで理由の文に続ける、ボタンで足りないときに職員が次にすることの文。無い理由は undefined を返す。
 * ボタンが示す操作（書き直す、予定を開く）は繰り返さない。
 */
export const exportIssueReasonDetail = (issue: ExportIssueState) => {
  switch (issue.error_code) {
    case 'precondition_failed':
      if (issue.acceptable) return undefined
      return isCancelledSingleIssue(issue)
        ? '書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。'
        : 'Google カレンダーで元に戻すときは、職員に頼んでください。'
    case 'not_found':
      return '予定が消されたか、カレンダーの共有が外れていないかを、職員に確認してください。'
    case 'unappliable':
      return '終日の予定、タイトルの利用者が見つからない予定、繰り返しの予定そのものの変更が当たります。Google カレンダーで直すときは、職員に頼んでください。'
    case 'forbidden':
      return 'カレンダーが「予定の変更」の権限で共有されているかを、職員に確認してください。'
    default:
      return undefined
  }
}
