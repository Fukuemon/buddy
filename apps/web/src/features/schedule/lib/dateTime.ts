const pad = (value: number) => String(value).padStart(2, '0')

/** 日付を、デバイスの時間帯で `YYYY-MM-DD` にする。 */
export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** `YYYY-MM-DD` を、デバイスの時間帯の 0 時の Date にする。 */
export const fromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
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
  const date = fromDateKey(dateKey)
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
