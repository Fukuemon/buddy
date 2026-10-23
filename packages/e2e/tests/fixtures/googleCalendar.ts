import type { APIRequestContext } from '@playwright/test'

import { CALENDARPIT_URL, GCALHOLD_URL } from './env'

/** calendarpit の予定のうち、spec が見る項目。 */
export type GoogleEvent = {
  id: string
  summary?: string
  status?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  extendedProperties?: { private?: Record<string, string> }
}

const eventsUrl = (calendarId: string) =>
  `${CALENDARPIT_URL}/__calendarpit/calendars/${encodeURIComponent(calendarId)}/events`

const ensureOk = async (res: Awaited<ReturnType<APIRequestContext['get']>>, what: string) => {
  if (!res.ok()) throw new Error(`${what}: ${res.status()} ${await res.text()}`)
}

/** calendarpit の管理の API で、カレンダーの消していない予定を返す。予定の API が書いた予定を確認するのに使う。 */
export const listGoogleEvents = async (request: APIRequestContext, calendarId: string) => {
  // 1 ページで読み切れるよう、件数の上限を最大にする
  const res = await request.get(eventsUrl(calendarId), { params: { maxResults: 2500 } })
  await ensureOk(res, '予定を読めない')
  const { items = [] } = (await res.json()) as { items?: GoogleEvent[] }
  return items
}

/** カレンダーの予定のうち、タイトルが summary のものを返す。 */
export const findGoogleEvent = async (
  request: APIRequestContext,
  calendarId: string,
  summary: string,
) => (await listGoogleEvents(request, calendarId)).find((event) => event.summary === summary)

const shift = (dateTime: string | undefined, hours: number) => {
  if (!dateTime) return dateTime
  // 予定の API が書く日時は +09:00 の形なので、同じ形で返す
  const moved = new Date(new Date(dateTime).getTime() + hours * 60 * 60 * 1000)
  const jst = new Date(moved.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19)
  return `${jst}+09:00`
}

/**
 * 予定を 1 時間遅らせる。職員が Google カレンダーで予定を直したときの代わりで、etag が変わる。
 * calendarpit の管理の画面で予定を直したときと同じ管理の API を使う。
 */
export const shiftGoogleEvent = async (
  request: APIRequestContext,
  calendarId: string,
  eventId: string,
) => {
  const url = `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`
  const res = await request.get(url)
  await ensureOk(res, '予定を読めない')
  const event = (await res.json()) as GoogleEvent
  const patched = await request.patch(url, {
    data: {
      start: { ...event.start, dateTime: shift(event.start?.dateTime, 1) },
      end: { ...event.end, dateTime: shift(event.end?.dateTime, 1) },
    },
  })
  await ensureOk(patched, '予定を直せない')
}

/**
 * 予定を消す。職員が Google カレンダーで予定を消したときの代わりで、予定は status が cancelled になり、etag が変わる。
 * calendarpit の管理の画面で予定を消したときと同じ管理の API を使う。
 */
export const deleteGoogleEvent = async (
  request: APIRequestContext,
  calendarId: string,
  eventId: string,
) => {
  // 管理の API は、本文の無い削除にも application/json を求める
  const res = await request.delete(`${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  await ensureOk(res, '予定を消せない')
}

/** 中継の gcalhold が、Google の変更を予定の API に渡すかを変える。 */
export const holdGoogleChanges = async (request: APIRequestContext, hold: boolean) => {
  const res = await request.post(`${GCALHOLD_URL}/hold`, { data: { hold } })
  await ensureOk(res, '変更を止められない')
}

/**
 * calendarpit の管理の API で、予定の API の利用者が持つカレンダーを作る。職員が自分のカレンダーを事業所のサービスアカウントに
 * 共有したときの代わりで、走らせるたびに違う職員のカレンダーにする。
 */
export const createGoogleCalendar = async (request: APIRequestContext, calendarId: string) => {
  const res = await request.post(`${CALENDARPIT_URL}/__calendarpit/calendars`, {
    data: { id: calendarId, userId: 'schedule', summary: calendarId, timeZone: 'Asia/Tokyo' },
  })
  await ensureOk(res, 'カレンダーを作れない')
}

/** 日時を持つ予定を作る。職員が Google カレンダーで予定を足したときの代わりで、作った予定を返す。 */
export const createGoogleEvent = async (
  request: APIRequestContext,
  calendarId: string,
  event: { summary: string; date: string; start: string; end: string },
) => {
  const res = await request.post(eventsUrl(calendarId), {
    data: {
      summary: event.summary,
      start: { dateTime: `${event.date}T${event.start}:00+09:00` },
      end: { dateTime: `${event.date}T${event.end}:00+09:00` },
    },
  })
  await ensureOk(res, '予定を作れない')
  return (await res.json()) as GoogleEvent
}
