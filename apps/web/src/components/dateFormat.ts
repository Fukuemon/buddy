/**
 * 画面に出す日付と時刻の形を作る。形の規則は context/conventions.md の「画面の文言」にある。
 * 日付は `2026年11月9日（月）`、時刻の範囲は `09:00〜09:29`、翌日に終わる範囲は `22:00〜翌 01:00` にする。
 */

const pad = (value: number) => String(value).padStart(2, '0')

/** 曜日の 1 文字。`Date.getDay()` の値で引く。 */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 事業所の現地（Asia/Tokyo）の UTC からの差。予定の API の日付と同じく、事業所は日本にあるものとする。 */
const FACILITY_UTC_OFFSET_MS = 9 * 60 * 60 * 1000

type DateParts = { year: number; month: number; day: number; weekday: number }

const formatParts = ({ year, month, day, weekday }: DateParts, withYear: boolean) =>
  `${withYear ? `${year}年` : ''}${month}月${day}日（${WEEKDAYS[weekday]}）`

/** 日付の形の選び方。同じ画面で年が分かるところでは withYear を false にする。 */
export type DateFormatOptions = { withYear?: boolean }

/**
 * `YYYY-MM-DD` を `2026年11月9日（月）` の形にする。withYear が false なら `11月9日（月）` にする。
 * 曜日は暦の日付だけで決め、デバイスの時間帯に左右されない。
 */
export const formatDateKey = (dateKey: string, { withYear = true }: DateFormatOptions = {}) => {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return formatParts({ year, month, day, weekday }, withYear)
}

/** Date を、デバイスの時間帯の日付で `2026年11月9日（月）` の形にする。withYear が false なら年を省く。 */
export const formatDate = (date: Date, { withYear = true }: DateFormatOptions = {}) =>
  formatParts(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: date.getDay(),
    },
    withYear,
  )

/** Date を、デバイスの時間帯で `09:00` の形にする。 */
export const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** Date を、デバイスの時間帯で `2026年10月20日（火） 15:42` の形にする。 */
export const formatDateTime = (date: Date) => `${formatDate(date)} ${formatTime(date)}`

/** ISO 8601 の日時を、事業所の現地（Asia/Tokyo）の日付で `2026年9月30日（水）` の形にする。 */
export const formatFacilityDate = (dateTime: string) =>
  formatDateKey(
    new Date(new Date(dateTime).getTime() + FACILITY_UTC_OFFSET_MS).toISOString().slice(0, 10),
  )

/** 時刻の範囲の前と後ろに付ける印。翌日に終わるなら `nextDay`、前の日に始まるなら `previousDay` にする。 */
export type TimeRangeDay = 'sameDay' | 'nextDay' | 'previousDay'

/**
 * 開始と終了の時刻（`HH:mm` か `HH:mm:ss`）を `09:00〜09:29` の形にする。
 * day が `nextDay` なら `22:00〜翌 01:00`、`previousDay` なら `前日 22:00〜01:00` にする。
 */
export const formatTimeRange = (start: string, end: string, day: TimeRangeDay = 'sameDay') =>
  `${day === 'previousDay' ? '前日 ' : ''}${start.slice(0, 5)}〜${day === 'nextDay' ? '翌 ' : ''}${end.slice(0, 5)}`

/**
 * `YYYY-MM-DD` の期間を `2026年11月1日（日）〜2026年11月30日（月）` の形にする。
 * 終わりの無い期間は `2026年11月1日（日）〜` にする。
 */
export const formatDateKeyRange = (start: string, end: string | null | undefined) =>
  `${formatDateKey(start)}〜${end == null ? '' : formatDateKey(end)}`
