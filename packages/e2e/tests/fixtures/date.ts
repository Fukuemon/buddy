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
