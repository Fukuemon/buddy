import type { CalendarCutoverCalendar, CalendarCutoverUnmet } from '#/api/types'

import { formatDateTime, formatDateWithWeekday } from './format'

/** 完了の確認を満たさない理由の文言。満たさない一覧の理由の列に出す。 */
export const UNMET_REASON_LABEL: Record<CalendarCutoverUnmet['reason'], string> = {
  not_imported: 'この切り替えで、まだ取り込んでいない',
  sync_stale: '最後の取り込みの後に、同期が成功していない',
  event_not_imported: '取り込んでいない予定がある',
  needs_review: '確認が必要な予定の取り込み方を決めていない',
  changed: '取り込んだ後に Google で変わった',
  deleted: '取り込んだ後に Google で消えた',
}

/** 満たさない理由ごとの、次にすることの文。 */
export const UNMET_REASON_ACTION: Record<CalendarCutoverUnmet['reason'], string> = {
  not_imported: '取り込んでください',
  sync_stale: '同期が終わるまで待ってから、もう一度完了してください',
  event_not_imported: '取り込み直してください',
  needs_review: '取り込み直して、取り込み方を選んでください',
  changed: '取り込み直すと、Google の内容で上書きします',
  deleted: '取り込み直すと、buddy の写しを消します',
}

/** 満たさない予定の日時を「2026/11/04（水）10:00〜11:00」の形にする。日時の無いカレンダーの理由と消えた予定は「—」にする。 */
export const formatUnmetDateTime = (item: CalendarCutoverUnmet) => {
  if (item.date === null) return '—'
  const date = formatDateWithWeekday(item.date)
  if (item.start_time === null || item.end_time === null) return date
  return `${date}${item.start_time}〜${item.ends_next_day ? '翌 ' : ''}${item.end_time}`
}

/** カレンダーのこの切り替えの最後の取り込みを「2026/10/20 15:42」の形にする。取り込んでいなければ「まだ取り込んでいない」。 */
export const formatCutoverImport = (calendar: CalendarCutoverCalendar) =>
  calendar.last_import === null
    ? 'まだ取り込んでいない'
    : formatDateTime(calendar.last_import.finished_at ?? calendar.last_import.started_at)

/** カレンダーの最後の同期を「2026/10/20 15:42」の形にする。失敗していれば「（失敗）」を、同期していなければ「まだ同期していない」にする。 */
export const formatCutoverSync = (calendar: CalendarCutoverCalendar) => {
  const at =
    calendar.last_succeeded_at === null
      ? 'まだ同期していない'
      : formatDateTime(calendar.last_succeeded_at)
  return calendar.last_status === 'failed' ? `${at}（最後の同期は失敗）` : at
}

/** 全てのカレンダーの最後の同期が成功しているかを返す。切り替えを始める条件である。 */
export const isAllSynced = (calendars: readonly CalendarCutoverCalendar[]) =>
  calendars.every((calendar) => calendar.last_status === 'succeeded')
