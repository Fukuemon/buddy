import type { ImportRange } from '#/api/types'

const pad = (value: number) => String(value).padStart(2, '0')

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** 今日の次の月の 1 日から月末までの期間を返す。取り込みの期間のデフォルト値に使う。 */
export const nextMonthRange = (today: Date): ImportRange => ({
  range_start: toDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 1)),
  range_end: toDateKey(new Date(today.getFullYear(), today.getMonth() + 2, 0)),
})

/** 期間のエラー。start は開始日の欄の下に、end は終了日の欄の下に出す。 */
export type ImportRangeErrors = { start?: string; end?: string }

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * 期間を確認する。開始日が終了日より後なら開始日に、1 年を超えるなら終了日にエラーを返す。
 * 1 年までは、予定の API と同じく、終了日が開始日の 1 年後の日より前であることとする。
 */
export const validateImportRange = (start: string, end: string): ImportRangeErrors => {
  if (!DATE_KEY.test(start) || !DATE_KEY.test(end)) return {}
  if (start > end) return { start: '開始日は、終了日より前の日にしてください。' }
  const [year, month, day] = start.split('-').map(Number)
  if (end >= toDateKey(new Date(year + 1, month - 1, day)))
    return { end: '期間は 1 年までにしてください。' }
  return {}
}

/** 開始日と終了日がそろい、期間にエラーが無ければ true を返す。 */
export const isImportRangeReady = (start: string, end: string) => {
  const errors = validateImportRange(start, end)
  return (
    DATE_KEY.test(start) &&
    DATE_KEY.test(end) &&
    errors.start === undefined &&
    errors.end === undefined
  )
}
