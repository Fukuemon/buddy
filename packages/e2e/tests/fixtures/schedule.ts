import type { APIRequestContext } from '@playwright/test'

import { SCHEDULE_URL } from './env'
import type { GoogleEvent } from './googleCalendar'

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

/** 日付（YYYY-MM-DD）と時刻（HH:mm）を、予定の詳細の日時の形（2026年10月22日（木） 09:00〜10:00）にする。 */
export const detailDateTimeText = (date: string, start: string, end: string) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const weekday = '日月火水木金土'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${year}年${month}月${day}日（${weekday}） ${start}〜${end}`
}

/** Google カレンダーの予定の時刻の範囲（10:00〜11:00）を返す。 */
export const googleTimeRange = (event: GoogleEvent | undefined) =>
  `${(event?.start?.dateTime ?? '').slice(11, 16)}〜${(event?.end?.dateTime ?? '').slice(11, 16)}`

/** Google カレンダーの予定の日時を、予定の詳細の日時の形にする。 */
export const detailDateTime = (event: GoogleEvent | undefined) => {
  const start = event?.start?.dateTime ?? ''
  const end = event?.end?.dateTime ?? ''
  return detailDateTimeText(start.slice(0, 10), start.slice(11, 16), end.slice(11, 16))
}

/**
 * 予定の API で、facilityId の事業所に staffId の職員の通常の予定を 1 件作り（createSchedule）、レスポンスを返す。
 * 予定の種類の ID は、予定の種類の一覧（listScheduleTypes）から「通常」を引く。
 */
export const createNormalSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  schedule: { staffId: string; title: string; date: string },
) => {
  const headers = { Authorization: `Bearer ${token}` }
  const types = (await (
    await request.get(`${SCHEDULE_URL}/v1/schedule_types`, { headers })
  ).json()) as { id: string; name: string }[]
  const normal = types.find(({ name }) => name === '通常')
  if (normal === undefined) throw new Error('予定の種類に「通常」が無い')
  return request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers,
    data: {
      schedule_type_id: normal.id,
      date: schedule.date,
      start_time: '10:00',
      end_time: '11:00',
      staff_id: schedule.staffId,
      title: schedule.title,
    },
  })
}

/** 予定の API の予定の取得（GET /v1/schedules/{schedule_id}）を token の職員で呼び、レスポンスを返す。 */
export const getSchedule = (request: APIRequestContext, token: string, scheduleId: string) =>
  request.get(`${SCHEDULE_URL}/v1/schedules/${scheduleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
