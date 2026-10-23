import type { ExternalCalendar, ImportReviewItem, ImportSkippedItem } from '#/api/types'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` を「2026/11/04」の形にする。 */
export const formatDate = (date: string) => date.replaceAll('-', '/')

/** `YYYY-MM-DD` を「2026/11/04（水）」の形にする。 */
export const formatDateWithWeekday = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return `${formatDate(date)}（${WEEKDAYS[weekday]}）`
}

/** 期間を「2026/11/01〜2026/11/30」の形にする。 */
export const formatDateRange = (start: string, end: string) =>
  `${formatDate(start)}〜${formatDate(end)}`

const formatTime = (time: string) => time.slice(0, 5)

/** オフセットつきの日時を、デバイスの時間帯で「2026/10/20 15:42」の形にする。 */
export const formatDateTime = (iso: string) => {
  const date = new Date(iso)
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** カレンダーの最後の取り込みを「2026/10/20 15:42（2026/10/01〜2026/10/31）」の形にする。取り込んだことが無ければ「なし」。 */
export const formatLastImport = (run: ExternalCalendar['last_import']) => {
  if (run === null) return 'なし'
  const failed = run.status === 'failed' ? '（失敗）' : ''
  return `${formatDateTime(run.finished_at ?? run.started_at)}${failed}（${formatDateRange(run.range_start, run.range_end)}）`
}

/** 確認が必要な予定の日時を「2026/11/04（水）10:00〜11:00」の形にする。 */
export const formatReviewDateTime = (item: ImportReviewItem) =>
  `${formatDateWithWeekday(item.date)}${formatTime(item.start_time)}〜${formatTime(item.end_time)}`

/** 繰り返しの規則を「毎週水曜日の繰り返し」の形にする。読めない規則は「繰り返し」にする。 */
export const formatRecurrence = (rule: NonNullable<ImportReviewItem['recurrence']>) => {
  // day_of_week は 1 が月曜、7 が日曜
  const weekday = rule.day_of_week == null ? undefined : `${WEEKDAYS[rule.day_of_week % 7]}曜日`
  if (rule.frequency === 'weekly' && weekday !== undefined) return `毎週${weekday}の繰り返し`
  if (rule.frequency === 'monthly' && rule.day_of_month != null)
    return `毎月 ${rule.day_of_month} 日の繰り返し`
  if (rule.frequency === 'monthly' && rule.week_of_month != null && weekday !== undefined)
    return `毎月第 ${rule.week_of_month} ${weekday}の繰り返し`
  return '繰り返し'
}

/** 取り込まない予定の日時を、読めた分だけ「2026/11/12（木）17:00〜翌 09:00」の形にする。 */
export const formatSkippedDateTime = (item: ImportSkippedItem) => {
  if (item.date === null) return '日時を読めない'
  const date = formatDateWithWeekday(item.date)
  if (item.all_day) return `${date}終日`
  if (item.start_time === null) return date
  const start = formatTime(item.start_time)
  if (item.end_time === null) return `${date}${start}〜`
  const nextDay = item.reason === 'multi_day' ? '翌 ' : ''
  return `${date}${start}〜${nextDay}${formatTime(item.end_time)}`
}
