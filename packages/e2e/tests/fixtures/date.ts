/** 1 日のミリ秒。 */
const DAY_MS = 24 * 60 * 60 * 1000

/** Asia/Tokyo の UTC からのずれのミリ秒。予定の API と画面は事業所の時間帯（Asia/Tokyo）の日付で予定を持つ。 */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000

/** Asia/Tokyo の今日から days 日後の日付（YYYY-MM-DD）。負の値で前の日になる。 */
export const daysFromToday = (days: number) =>
  new Date(Date.now() + TOKYO_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10)

/** Asia/Tokyo の今日の日付（YYYY-MM-DD）。 */
export const todayInTokyo = () => daysFromToday(0)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。Asia/Tokyo の今日から数える。 */
export const fromNextMonday = (days: number) => {
  const today = new Date(`${todayInTokyo()}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** 日付（YYYY-MM-DD）の days 日後の日付（YYYY-MM-DD）。負の値で前の日になる。 */
export const addDays = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)

/**
 * Asia/Tokyo の今日の週の日曜から weeks 週後の週の、日曜の日付（YYYY-MM-DD）。予定のカレンダーの週は日曜に始まる。
 * spec ごとに週を分け、ほかの spec の予定と重ならないようにするのに使う。
 */
export const sundayOfWeek = (weeks: number) => {
  const today = todayInTokyo()
  return addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay() + weeks * 7)
}

/** 日付（YYYY-MM-DD）を、字幕に出す「11月24日（火）」の形にする。 */
export const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${'日月火水木金土'[d.getUTCDay()]}）`
}
