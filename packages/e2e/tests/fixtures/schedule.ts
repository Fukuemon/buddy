/** 予定の詳細の URL。予定の ID は ULID で、後ろに編集のパスか search params が続くことがある。 */
export const SCHEDULE_DETAIL_URL = /\/schedule\/[0-9A-HJKMNP-TV-Z]{26}(?:[/?#]|$)/

/**
 * 予定の詳細の URL（/schedule/<予定の ID>）から、予定の ID を返す。
 * 予定の作成と変更の画面は予定の ID を出さないので、作った予定を開いた後の URL から得る。
 */
export const scheduleIdFromUrl = (url: string) => {
  const id = /^\/schedule\/([0-9A-HJKMNP-TV-Z]{26})(?:\/|$)/.exec(new URL(url).pathname)?.[1]
  if (id === undefined) throw new Error(`予定の詳細の URL ではない: ${url}`)
  return id
}
