import type { ImportReviewItem, ImportSkippedItem } from '#/api/types'
import { formatDate } from '#/components/lastImport'

export { formatDateRange, formatDateTime, formatLastImport } from '#/components/lastImport'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** `YYYY-MM-DD` を「2026/11/04（水）」の形にする。 */
export const formatDateWithWeekday = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return `${formatDate(date)}（${WEEKDAYS[weekday]}）`
}

const formatTime = (time: string) => time.slice(0, 5)

/** 確認が必要な予定の日時を「2026/11/04（水）10:00〜11:00」の形にする。終了が翌日の予定は「22:00〜翌 01:00」にする。 */
export const formatReviewDateTime = (item: ImportReviewItem) =>
  `${formatDateWithWeekday(item.date)}${formatTime(item.start_time)}〜${item.ends_next_day ? '翌 ' : ''}${formatTime(item.end_time)}`

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
  const nextDay = item.reason === 'multi_day' || item.ends_next_day ? '翌 ' : ''
  return `${date}${start}〜${nextDay}${formatTime(item.end_time)}`
}
