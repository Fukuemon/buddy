import type { APIRequestContext } from '@playwright/test'

import { SCHEDULE_URL } from './env'

/** 予定の API の、事業所の外していないカレンダーの一覧（listExternalCalendars）を token の職員で返す。 */
export const listExternalCalendars = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/external_calendars`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) throw new Error(`カレンダーの一覧を取れない: ${res.status()}`)
  return ((await res.json()) as { items: { id: string; staff_id: string }[] }).items
}

/** 予定の API の取り込みのプレビュー（createCalendarImportPreview）を token の職員で呼び、レスポンスを返す。 */
export const previewImport = (
  request: APIRequestContext,
  token: string,
  externalCalendarId: string,
  range: { start: string; end: string },
) =>
  request.post(`${SCHEDULE_URL}/v1/external_calendars/${externalCalendarId}/import_previews`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { range_start: range.start, range_end: range.end },
  })

/** 予定の API の予定の一覧（listSchedules）から、date の日のタイトルが title の予定を返す。 */
export const findSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  { date, title }: { date: string; title: string },
) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { date_from: date, date_to: date },
  })
  if (!res.ok()) throw new Error(`予定の一覧を取れない: ${res.status()}`)
  const body = (await res.json()) as {
    schedules: { id: string; title: string | null; start_time: string; staff_id: string }[]
  }
  return body.schedules.find((schedule) => schedule.title === title)
}
