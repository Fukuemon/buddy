import type { APIRequestContext } from '@playwright/test'

import { SCHEDULE_URL } from './env'
import type { GoogleEvent } from './googleCalendar'

/** 予定の詳細の URL。予定の ID は ULID で、後ろに編集のパスか search params が続くことがある。 */
export const SCHEDULE_DETAIL_URL = /\/schedule\/[0-9A-HJKMNP-TV-Z]{26}(?:[/?#]|$)/

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * 新しい予定の ID（ULID）を返す。google_primary の事業所では、画面が予定の ID を決めて作成のリクエストに付ける。
 * 先頭の 10 文字は今の時刻のミリ秒、残りの 16 文字は乱数である。
 */
export const newScheduleId = () => {
  let time = Date.now()
  let head = ''
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[time % 32] + head
    time = Math.floor(time / 32)
  }
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => CROCKFORD[b % 32])
  return head + tail.join('')
}

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
 * 通常の予定の値。日付と職員とタイトルと時刻のほかは、どの予定も同じにする。
 * start と end（HH:mm）を省くと 10:00〜11:00 にする。同じ職員の同じ時刻の予定は日の表示で重なって押せないので、1 本の spec で何件も作るときに時刻をずらす。
 */
type NormalSchedule = {
  staffId: string
  title: string
  date: string
  start?: string
  end?: string
  /** メモ。省くと空にする。 */
  description?: string
}

/** name の予定の種類か、code のサービスコードの ID を、token の職員で一覧（path）から引く。 */
const masterId = async (request: APIRequestContext, token: string, path: string, name: string) => {
  const res = await request.get(`${SCHEDULE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) throw new Error(`${path} を取れない: ${res.status()}`)
  const found = ((await res.json()) as { id: string; name?: string; code?: string }[]).find(
    (master) => (master.name ?? master.code)?.normalize('NFKC') === name.normalize('NFKC'),
  )
  if (found === undefined) throw new Error(`${path} に ${name} が無い`)
  return found.id
}

/**
 * token の職員で、予定の API の本文に入れる通常の予定の値を作る。
 * 予定の種類の ID は、予定の種類の一覧（listScheduleTypes）から「通常」を引く。
 */
const normalSlot = async (request: APIRequestContext, token: string, schedule: NormalSchedule) => ({
  schedule_type_id: await masterId(request, token, '/v1/schedule_types', '通常'),
  date: schedule.date,
  start_time: schedule.start ?? '10:00',
  end_time: schedule.end ?? '11:00',
  staff_id: schedule.staffId,
  title: schedule.title,
  ...(schedule.description === undefined ? {} : { description: schedule.description }),
})

/**
 * 予定の API で、facilityId の事業所に、staffId の職員を主訪問者にした patientId の利用者の訪問の予定を 1 件作り（createSchedule）、レスポンスを返す。
 * サービスコードは serviceCode（例: 訪看I3）にし、訪問の区分は付けない。
 */
export const createVisitSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  visit: {
    staffId: string
    patientId: string
    serviceCode: string
    date: string
    start: string
    end: string
  },
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      schedule_type_id: await masterId(request, token, '/v1/schedule_types', '訪問'),
      date: visit.date,
      start_time: visit.start,
      end_time: visit.end,
      staff_id: visit.staffId,
      visit_info: {
        patient_id: visit.patientId,
        assigned_staff_id: visit.staffId,
        service_code_id: await masterId(
          request,
          token,
          '/v1/visit_infos/service_codes',
          visit.serviceCode,
        ),
      },
    },
  })

/** 予定の API で、facilityId の事業所に staffId の職員の通常の予定を 1 件作り（createSchedule）、レスポンスを返す。 */
export const createNormalSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  schedule: NormalSchedule,
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    data: await normalSlot(request, token, schedule),
  })

/**
 * 予定の API で、facilityId の事業所に staffId の職員の、date の 22:00 に始まり翌日の 01:00 に終わる通常の予定を 1 件作り（createSchedule）、レスポンスを返す。
 */
export const createOvernightSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  schedule: NormalSchedule,
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ...(await normalSlot(request, token, schedule)),
      start_time: '22:00',
      end_time: '01:00',
      ends_next_day: true,
    },
  })

/**
 * 予定の API で、facilityId の事業所に staffId の職員の、毎週の 22:00 に始まり翌日の 01:00 に終わる通常の予定を作り（createRecurringSchedule）、レスポンスを返す。
 */
export const createWeeklyOvernightSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  schedule: NormalSchedule,
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules/recurring`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ...(await normalSlot(request, token, schedule)),
      start_time: '22:00',
      end_time: '01:00',
      ends_next_day: true,
      recurring_rule: { frequency: 'weekly' },
    },
  })

/**
 * 予定の API で、facilityId の事業所に staffId の職員の毎週の通常の予定を作り（createRecurringSchedule）、レスポンスを返す。
 * google_primary の事業所では、schedule.id に newScheduleId の ID を渡す。
 * schedule.rule に毎週の曜日の並び（days_of_week）と間隔（interval）を渡せる。渡さなければ最初の日付の曜日の毎週にする。
 */
export const createWeeklyNormalSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  schedule: NormalSchedule & { id?: string; rule?: { days_of_week?: number[]; interval?: number } },
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules/recurring`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ...(await normalSlot(request, token, schedule)),
      ...(schedule.id === undefined ? {} : { id: schedule.id }),
      recurring_rule: { frequency: 'weekly', ...schedule.rule },
    },
  })

/**
 * 予定の API で、facilityId の事業所に staffId の職員の、毎月の第 weekOfMonth 週の dayOfWeek 曜日（1 が月曜）の通常の予定を作り（createRecurringSchedule）、レスポンスを返す。
 * endDate（YYYY-MM-DD）を渡すと、その日を含む日までの繰り返しにする。
 */
export const createMonthlyWeekdayNormalSchedule = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  schedule: NormalSchedule & { dayOfWeek: number; weekOfMonth: number; endDate?: string },
) =>
  request.post(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules/recurring`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ...(await normalSlot(request, token, schedule)),
      recurring_rule: {
        frequency: 'monthly',
        day_of_week: schedule.dayOfWeek,
        week_of_month: schedule.weekOfMonth,
        ...(schedule.endDate === undefined ? {} : { end_date: schedule.endDate }),
      },
    },
  })

/**
 * 予定の API で、繰り返しの予定 recurringScheduleId の originalDate の回を、schedule.date の 10:00〜11:00 の通常の予定に置き換え（changeOccurrence）、
 * レスポンスを返す。buddy_primary の事業所で使う。
 */
export const replaceOccurrence = async (
  request: APIRequestContext,
  token: string,
  recurringScheduleId: string,
  originalDate: string,
  schedule: NormalSchedule,
) =>
  request.post(`${SCHEDULE_URL}/v1/schedules/recurring/${recurringScheduleId}/occurrences`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { ...(await normalSlot(request, token, schedule)), original_date: originalDate },
  })

/** 予定の API で、予定 scheduleId を通常の予定 schedule に置き換え（updateSchedule）、レスポンスを返す。 */
export const updateNormalSchedule = async (
  request: APIRequestContext,
  token: string,
  scheduleId: string,
  schedule: NormalSchedule,
) =>
  request.put(`${SCHEDULE_URL}/v1/schedules/${scheduleId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: await normalSlot(request, token, schedule),
  })

/** 予定の API で、facilityId の事業所の、date に始まる単発の予定のタイトルを token の職員で一覧する（listSchedules）。 */
export const listScheduleTitles = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  date: string,
) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { date_from: date, date_to: date },
  })
  if (!res.ok()) throw new Error(`予定の一覧が ${res.status()} を返した`)
  const { schedules } = (await res.json()) as { schedules: { title: string | null }[] }
  return schedules.map((schedule) => schedule.title)
}

/** 予定の API の予定の取得（GET /v1/schedules/{schedule_id}）を token の職員で呼び、レスポンスを返す。 */
export const getSchedule = (request: APIRequestContext, token: string, scheduleId: string) =>
  request.get(`${SCHEDULE_URL}/v1/schedules/${scheduleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
