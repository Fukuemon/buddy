const pad = (value: number) => String(value).padStart(2, '0')

/** 日付を、デバイスの時間帯で `YYYY-MM-DD` にする。 */
export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** `YYYY-MM-DD` を、デバイスの時間帯の 0 時の Date にする。 */
export const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/** `YYYY-MM-DD` に日数を足した `YYYY-MM-DD` を返す。 */
export const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** 日時を、デバイスの時間帯で `HH:mm` にする。 */
export const toTimeKey = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** Date を、デバイスの時間帯のオフセットつきの ISO 8601 にする。例 `2026-10-20T09:00:00+09:00` */
export const toOffsetDateTime = (date: Date) => {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${toDateKey(date)}T${toTimeKey(date)}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** `YYYY-MM-DD` と `HH:mm` を、デバイスの時間帯のオフセットつきの ISO 8601 にする。 */
export const combineDateTime = (dateKey: string, timeKey: string) => {
  const [hours, minutes] = timeKey.split(':').map(Number) as [number, number]
  const date = parseDateKey(dateKey)
  date.setHours(hours, minutes, 0, 0)
  return toOffsetDateTime(date)
}

/** `HH:mm` に分を足した `HH:mm` を返す。日をまたぐと 24 時間で回る。 */
export const addMinutesToTimeKey = (timeKey: string, minutes: number) => {
  const [hours, mins] = timeKey.split(':').map(Number) as [number, number]
  const total = (((hours * 60 + mins + minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** 2 つの `HH:mm` の差を分で返す。 */
export const diffMinutes = (startTimeKey: string, endTimeKey: string) => {
  const toMinutes = (timeKey: string) => {
    const [hours, minutes] = timeKey.split(':').map(Number) as [number, number]
    return hours * 60 + minutes
  }
  return toMinutes(endTimeKey) - toMinutes(startTimeKey)
}

/** 曜日の 1 文字。`Date.getDay()` の値で引く。 */
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 終了が開始の翌日なら `翌 `、同じ日なら空の文字列を返す。終了の時刻の前に付ける。 */
export const nextDayPrefix = (start: Date, end: Date) =>
  toDateKey(start) === toDateKey(end) ? '' : '翌 '

/**
 * 開始と終了の日時を、デバイスの時間帯で `2026年10月20日（火） 09:00〜09:29` の形にする。
 * 終了が開始の翌日なら `2026年10月20日（火） 22:00〜翌 01:00` の形にする。
 */
export const formatDateTimeRange = (start: Date, end: Date) =>
  `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日（${WEEKDAYS[start.getDay()]}） ${toTimeKey(start)}〜${nextDayPrefix(start, end)}${toTimeKey(end)}`
