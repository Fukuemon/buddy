import type { ImportReviewItem, ImportSkippedItem } from '#/api/types'
import {
  formatDateKey,
  formatDateKeyRange,
  formatDateTime as formatDateTimeOfDate,
  formatTimeRange,
} from '#/components/dateFormat'

export { formatLastImport } from '#/components/lastImport'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** `YYYY-MM-DD` の期間を「2026年11月1日（日）〜2026年11月30日（月）」の形にする。終わりの無い期間（切り替えの取り込み）は「2026年11月1日（日）〜」にする。 */
export const formatDateRange = formatDateKeyRange

/** オフセットつきの日時を、デバイスの時間帯で「2026年10月20日（火） 15:42」の形にする。 */
export const formatDateTime = (iso: string) => formatDateTimeOfDate(new Date(iso))

/** 確認が必要な予定の日時を「2026年11月4日（水） 10:00〜11:00」の形にする。終了が翌日の予定は「22:00〜翌 01:00」にする。 */
export const formatReviewDateTime = (item: ImportReviewItem) =>
  `${formatDateKey(item.date)} ${formatTimeRange(item.start_time, item.end_time, item.ends_next_day ? 'nextDay' : 'sameDay')}`

/** 曜日（1 が月曜、7 が日曜）を「水曜日」の形にする。 */
const weekdayName = (day: number) => `${WEEKDAYS[day % 7]}曜日`

/**
 * 繰り返しの規則を「毎週水曜日の繰り返し」「毎週月曜日、木曜日の繰り返し」「隔週火曜日の繰り返し」「3 週ごとの火曜日の繰り返し」の形にする。
 * 読めない規則は「繰り返し」にする。
 */
export const formatRecurrence = (rule: NonNullable<ImportReviewItem['recurrence']>) => {
  const weekday = rule.day_of_week == null ? undefined : weekdayName(rule.day_of_week)
  if (rule.frequency === 'weekly' && rule.days_of_week != null && rule.days_of_week.length > 0) {
    const days = rule.days_of_week.map(weekdayName).join('、')
    const interval = rule.interval ?? 1
    if (interval === 1) return `毎週${days}の繰り返し`
    return interval === 2 ? `隔週${days}の繰り返し` : `${interval} 週ごとの${days}の繰り返し`
  }
  if (rule.frequency === 'monthly' && rule.day_of_month != null)
    return `毎月 ${rule.day_of_month} 日の繰り返し`
  if (rule.frequency === 'monthly' && rule.week_of_month != null && weekday !== undefined)
    return `毎月第 ${rule.week_of_month} ${weekday}の繰り返し`
  return '繰り返し'
}

/** 取り込まない予定の日時を、読めた分だけ「2026年11月12日（木） 17:00〜翌 09:00」の形にする。 */
export const formatSkippedDateTime = (item: ImportSkippedItem) => {
  if (item.date === null) return '日時を読めない'
  const date = formatDateKey(item.date)
  if (item.all_day) return `${date} 終日`
  if (item.start_time === null) return date
  if (item.end_time === null) return `${date} ${item.start_time.slice(0, 5)}〜`
  const nextDay = item.reason === 'multi_day' || item.ends_next_day
  return `${date} ${formatTimeRange(item.start_time, item.end_time, nextDay ? 'nextDay' : 'sameDay')}`
}
