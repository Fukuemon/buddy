// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { scheduleHttp, server, TEST_SCHEDULE_URL } from '#/test/server'

import { ApiError } from '../BuddyApi'
import type { components } from '../generated/schedule'
import { createHttpBuddyApi } from './httpBuddyApi'
import { occurrenceId } from './recurrence'

const api = () => createHttpBuddyApi({ baseUrl: TEST_SCHEDULE_URL })

/** BFF と同じく Bearer のトークンを付けて呼ぶ API。共通の handler はトークンを求める。 */
const authorizedApi = () =>
  createHttpBuddyApi({
    baseUrl: TEST_SCHEDULE_URL,
    fetch: (input, init) => {
      const request = new Request(input, init)
      request.headers.set('Authorization', 'Bearer test')
      return globalThis.fetch(request)
    },
  })

const invalid = (message: string) => ({ code: 'invalid_input' as const, message })

/** 予定の作成と置き換えが引くマスタを、テストの ID で返す。 */
const masters = (
  types: { id: string; name: '通常' | '訪問' }[],
  codes: { id: string; code: string }[] = [],
) => [
  scheduleHttp.get('/v1/schedule_types', ({ response }) => response(200).json(types)),
  scheduleHttp.get('/v1/visit_infos/service_codes', ({ response }) =>
    response(200).json(
      codes.map((c) => ({ ...c, service_time_range_start: 20, service_time_range_end: 29 })),
    ),
  ),
  scheduleHttp.get('/v1/visit_infos/visit_categories', ({ response }) => response(200).json([])),
]

const schedule = (
  id: string,
  overrides: Partial<components['schemas']['Schedule']> = {},
): components['schemas']['Schedule'] => ({
  id,
  facility_id: 'facility-1',
  schedule_type_id: 'type-normal',
  schedule_type: '通常',
  date: '2026-10-20',
  start_time: '09:00',
  end_time: '10:00',
  ends_next_day: false,
  is_over_time_work: false,
  staff_id: 'staff-1',
  staff_name: '',
  title: id,
  description: null,
  recurring_schedule_id: null,
  visit_info: null,
  cancel: null,
  source: 'buddy',
  review_reason: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

/** buddy_primary の事業所の一覧の応答の、予定のほかの項目。 */
const BUDDY_PRIMARY_LIST = {
  source_mode: 'buddy_primary' as const,
  calendar_syncs: [],
  cutover: null,
  all_day_events: [],
  unlisted_event_counts: [],
}

describe('createHttpBuddyApi', () => {
  it('期間を日付にして予定を取り、キャンセル、期間の外、ほかの職員の予定を除く', async () => {
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/schedules', ({ query, response }) =>
        query.get('date_from') === '2026-10-20' && query.get('date_to') === '2026-10-20'
          ? response(200).json({
              schedules: [
                schedule('keep'),
                schedule('cancelled', {
                  cancel: { id: 'c', schedule_id: 'cancelled', reason: '' },
                }),
                schedule('other-staff', { staff_id: 'staff-2' }),
                schedule('outside', { start_time: '23:00', end_time: '23:30' }),
              ],
              recurring_schedules: [],
              ...BUDDY_PRIMARY_LIST,
            })
          : response(400).json(invalid('期間が日付になっていない')),
      ),
    )
    const list = await api().schedules.list('facility-1', {
      from: '2026-10-20T00:00:00+09:00',
      to: '2026-10-20T12:00:00+09:00',
      staffIds: ['staff-1'],
    })
    expect(list.schedules.map((s) => s.id)).toEqual(['keep'])
  })

  it('google_primary の事業所では、確認が必要な予定を期間で絞らず、予定と同期の状況を職員で絞って返す', async () => {
    const sync = (staffId: string): components['schemas']['CalendarSyncStatus'] => ({
      external_calendar_id: `calendar-${staffId}`,
      staff_id: staffId,
      staff_name: staffId,
      last_status: 'succeeded',
      last_succeeded_at: '2026-10-20T00:00:00Z',
      last_error: null,
    })
    const fromGoogle = { source: 'google_calendar' } as const
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/schedules', ({ response }) =>
        response(200).json({
          schedules: [
            schedule('projection', fromGoogle),
            schedule('review', { ...fromGoogle, review_reason: 'patient_not_found' }),
            schedule('recurrence', {
              ...fromGoogle,
              date: '2026-09-01',
              review_reason: 'recurrence_unsupported',
            }),
            schedule('other-staff', {
              ...fromGoogle,
              staff_id: 'staff-2',
              review_reason: 'title_unreadable',
            }),
          ],
          recurring_schedules: [],
          source_mode: 'google_primary',
          calendar_syncs: [sync('staff-1'), sync('staff-2')],
          cutover: {
            started_at: '2026-10-05T00:00:00Z',
            started_by: 'manager-1',
            started_by_name: '管理 花子',
            range_start: '2026-10-01',
          },
          all_day_events: [
            {
              id: 'allday-1',
              staff_id: 'staff-1',
              staff_name: '青木 一郎',
              start_date: '2026-10-20',
              end_date: '2026-10-21',
              title: '休み',
              review_reason: null,
            },
            {
              id: 'allday-2',
              staff_id: 'staff-2',
              staff_name: '石川 二葉',
              start_date: '2026-10-20',
              end_date: '2026-10-20',
              title: '研修',
              review_reason: null,
            },
            {
              id: 'allday-unsupported',
              staff_id: 'staff-1',
              staff_name: '青木 一郎',
              start_date: '2026-10-05',
              end_date: '2026-10-05',
              title: '当番',
              review_reason: 'recurrence_unsupported',
            },
          ],
          unlisted_event_counts: [
            { staff_id: 'staff-1', count: 2 },
            { staff_id: 'staff-2', count: 1 },
          ],
        }),
      ),
    )
    const list = await api().schedules.list('facility-1', {
      from: '2026-10-20T00:00:00+09:00',
      to: '2026-10-21T00:00:00+09:00',
      staffIds: ['staff-1'],
    })
    expect(list.sourceMode).toBe('google_primary')
    expect(list.schedules.map((s) => [s.id, s.fromGoogleCalendar])).toEqual([
      ['projection', true],
      ['review', true],
    ])
    expect(list.needsReview.map((s) => [s.id, s.reviewReason])).toEqual([
      ['review', 'patient_not_found'],
      ['recurrence', 'recurrence_unsupported'],
    ])
    expect(list.calendarSyncs.map((s) => s.staff_id)).toEqual(['staff-1'])
    const unsupportedAllDay = {
      id: 'allday-unsupported',
      staffId: 'staff-1',
      staffName: '青木 一郎',
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      title: '当番',
      reviewReason: 'recurrence_unsupported',
    }
    expect(list.allDayEvents).toEqual([
      {
        id: 'allday-1',
        staffId: 'staff-1',
        staffName: '青木 一郎',
        startDate: '2026-10-20',
        endDate: '2026-10-21',
        title: '休み',
      },
      unsupportedAllDay,
    ])
    // 期間の外の最初の回の日付でも、確認が必要な終日の予定に入る
    expect(list.needsReviewAllDayEvents).toEqual([unsupportedAllDay])
    expect(list.unlistedEventCounts).toEqual([{ staffId: 'staff-1', count: 2 }])
    expect(list.cutover).toEqual({
      started_at: '2026-10-05T00:00:00Z',
      started_by: 'manager-1',
      started_by_name: '管理 花子',
      range_start: '2026-10-01',
    })
  })

  it('事業所を読み、予定の正本を返す', async () => {
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}', ({ params, response }) =>
        response(200).json({
          id: params.facility_id,
          name: '事業所',
          source_mode: 'google_primary',
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        }),
      ),
    )
    expect(await api().facilities.get('facility-1')).toEqual({
      id: 'facility-1',
      name: '事業所',
      sourceMode: 'google_primary',
    })
  })

  it('前の日に始まり期間に終わる、翌日に終わる予定と繰り返しの予定の回を返す', async () => {
    const rs: components['schemas']['RecurringSchedule'] = {
      ...schedule('01M3TC6E9G4N8Q2R5T7V9W1X3Y', {
        date: '2026-10-12',
        start_time: '23:00',
        end_time: '02:00',
        ends_next_day: true,
      }),
      recurring_rule: { frequency: 'weekly' },
      exclusion_dates: [],
    }
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/schedules', ({ response }) =>
        response(200).json({
          schedules: [
            schedule('overnight', {
              date: '2026-10-19',
              start_time: '22:00',
              end_time: '01:00',
              ends_next_day: true,
            }),
          ],
          recurring_schedules: [rs],
          ...BUDDY_PRIMARY_LIST,
        }),
      ),
    )
    const list = await api().schedules.list('facility-1', {
      from: '2026-10-20T00:00:00+09:00',
      to: '2026-10-21T00:00:00+09:00',
    })
    expect(list.schedules.map((s) => [s.startsAt, s.endsAt])).toEqual([
      ['2026-10-19T22:00:00+09:00', '2026-10-20T01:00:00+09:00'],
      ['2026-10-19T23:00:00+09:00', '2026-10-20T02:00:00+09:00'],
    ])
  })

  it('includeCancelled のときは、キャンセルした予定も理由を付けて返す', async () => {
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/schedules', ({ response }) =>
        response(200).json({
          schedules: [
            schedule('keep'),
            schedule('cancelled', {
              cancel: { id: 'c', schedule_id: 'cancelled', reason: '体調不良' },
            }),
          ],
          recurring_schedules: [],
          ...BUDDY_PRIMARY_LIST,
        }),
      ),
    )
    const list = await api().schedules.list('facility-1', {
      from: '2026-10-20T00:00:00+09:00',
      to: '2026-10-20T12:00:00+09:00',
      includeCancelled: true,
    })
    expect(list.schedules.map((s) => [s.id, s.cancel])).toEqual([
      ['keep', undefined],
      ['cancelled', { reason: '体調不良' }],
    ])
  })

  it('繰り返しの予定を期間の回に分けて返し、回を読んで置き換える', async () => {
    const rs: components['schemas']['RecurringSchedule'] = {
      ...schedule('01M3TC6E9G4N8Q2R5T7V9W1X3Y', { date: '2026-10-06' }),
      recurring_rule: { frequency: 'weekly' },
      exclusion_dates: ['2026-10-13'],
    }
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/schedules', ({ response }) =>
        response(200).json({ schedules: [], recurring_schedules: [rs], ...BUDDY_PRIMARY_LIST }),
      ),
      scheduleHttp.get('/v1/schedules/recurring/{recurring_schedule_id}', ({ response }) =>
        response(200).json(rs),
      ),
      scheduleHttp.post(
        '/v1/schedules/recurring/{recurring_schedule_id}/occurrences',
        async ({ request, response }) => {
          const body = await request.json()
          return body.original_date === '2026-10-20' && body.start_time === '10:00'
            ? response(201).json(schedule('replaced', { date: '2026-10-20', start_time: '10:00' }))
            : response(400).json(invalid('回の日付か時刻が違う'))
        },
      ),
      ...masters([{ id: 'type-normal', name: '通常' }]),
    )
    const listed = await api().schedules.list('facility-1', {
      from: '2026-10-01T00:00:00+09:00',
      to: '2026-11-01T00:00:00+09:00',
    })
    expect(listed.schedules.map((s) => s.startsAt.slice(0, 10))).toEqual([
      '2026-10-06',
      '2026-10-20',
      '2026-10-27',
    ])
    const occurrence = await api().schedules.get('facility-1', listed.schedules[1].id)
    expect(occurrence.startsAt).toBe('2026-10-20T09:00:00+09:00')
    await expect(
      api().schedules.get('facility-1', listed.schedules[1].id.replace('10-20', '10-13')),
    ).rejects.toMatchObject({
      status: 404,
    })
    const replaced = await api().schedules.update(
      'facility-1',
      listed.schedules[1].id,
      {
        ...occurrence,
        startsAt: '2026-10-20T10:00:00+09:00',
        endsAt: '2026-10-20T11:00:00+09:00',
      },
      null,
    )
    expect(replaced.id).toBe('replaced')
  })

  it('繰り返しの予定の回の ID のキャンセルは、回のキャンセルの API に回の日付と理由を送る', async () => {
    const sent: unknown[] = []
    server.use(
      scheduleHttp.post(
        '/v1/schedules/recurring/{recurring_schedule_id}/occurrences/cancel',
        async ({ params, request, response }) => {
          sent.push({ id: params.recurring_schedule_id, body: await request.json() })
          return response(201).json({
            id: 'cancel-1',
            schedule_id: 'cancelled',
            reason: '体調不良',
          })
        },
      ),
    )
    await api().schedules.cancel(
      'facility-1',
      occurrenceId('01M3TC6E9G4N8Q2R5T7V9W1X3Y', '2026-10-20'),
      '体調不良',
      null,
    )
    expect(sent).toEqual([
      {
        id: '01M3TC6E9G4N8Q2R5T7V9W1X3Y',
        body: { original_date: '2026-10-20', reason: '体調不良' },
      },
    ])
  })

  it('単発の予定の削除は予定の削除の API を、回の ID の削除は回の削除の API を呼ぶ', async () => {
    const sent: unknown[] = []
    server.use(
      scheduleHttp.delete('/v1/schedules/{schedule_id}', ({ params, response }) => {
        sent.push({ id: params.schedule_id })
        return response(204).empty()
      }),
      scheduleHttp.post(
        '/v1/schedules/recurring/{recurring_schedule_id}/occurrences/delete',
        async ({ params, request, response }) => {
          sent.push({ id: params.recurring_schedule_id, body: await request.json() })
          return response(204).empty()
        },
      ),
    )
    await api().schedules.delete('facility-1', '01M3TC6E9G4N8Q2R5T7V9W1X3Z')
    await api().schedules.delete(
      'facility-1',
      occurrenceId('01M3TC6E9G4N8Q2R5T7V9W1X3Y', '2026-10-20'),
    )
    expect(sent).toEqual([
      { id: '01M3TC6E9G4N8Q2R5T7V9W1X3Z' },
      { id: '01M3TC6E9G4N8Q2R5T7V9W1X3Y', body: { original_date: '2026-10-20' } },
    ])
  })

  it('予定の削除を拒まれると、状態と code を持つ ApiError を投げる', async () => {
    server.use(
      scheduleHttp.delete('/v1/schedules/{schedule_id}', ({ response }) =>
        response(409).json({
          code: 'google_primary',
          message: 'Google カレンダーで管理しています',
        }),
      ),
    )
    await expect(
      api().schedules.delete('facility-1', '01M3TC6E9G4N8Q2R5T7V9W1X3Z'),
    ).rejects.toMatchObject({ status: 409, code: 'google_primary' })
  })

  it('繰り返しの予定の回は、繰り返しの予定の ID と規則を持ち、置き換えた予定と google_primary の単発の予定は持たない', async () => {
    const rs: components['schemas']['RecurringSchedule'] = {
      ...schedule('01M3TC6E9G4N8Q2R5T7V9W1X3Y', { date: '2026-10-06' }),
      recurring_rule: {
        frequency: 'weekly',
        days_of_week: [2],
        interval: 1,
        end_date: '2026-12-31',
      },
      exclusion_dates: [],
    }
    server.use(
      scheduleHttp.get('/v1/schedules/recurring/{recurring_schedule_id}', ({ response }) =>
        response(200).json(rs),
      ),
      scheduleHttp.get('/v1/schedules/{schedule_id}', ({ params, response }) =>
        response(200).json(
          params.schedule_id === 'gcal-occurrence'
            ? schedule('gcal-occurrence', {
                source: 'google_calendar',
                etag: '"parent"',
                recurring_schedule_id: '01M3TC6E9G4N8Q2R5T7V9W1X40',
                recurring_rule: { frequency: 'monthly', day_of_month: 20 },
              })
            : schedule('replaced', { recurring_schedule_id: rs.id }),
        ),
      ),
    )
    const occurrence = await api().schedules.get('facility-1', occurrenceId(rs.id, '2026-10-20'))
    expect(occurrence.recurrence).toEqual({
      recurringScheduleId: rs.id,
      rule: {
        frequency: 'weekly',
        daysOfWeek: [2],
        interval: 1,
        dayOfWeek: null,
        dayOfMonth: null,
        weekOfMonth: null,
        endDate: '2026-12-31',
      },
    })
    expect((await api().schedules.get('facility-1', 'replaced')).recurrence).toBeUndefined()
    expect((await api().schedules.get('facility-1', 'gcal-occurrence')).recurrence).toEqual({
      recurringScheduleId: '01M3TC6E9G4N8Q2R5T7V9W1X40',
      rule: {
        frequency: 'monthly',
        daysOfWeek: null,
        interval: null,
        dayOfWeek: null,
        dayOfMonth: 20,
        weekOfMonth: null,
        endDate: null,
      },
    })
  })

  it('規則の変更は、適用の日、規則、新しい ID と、読んだ etag を送り、変えた後の繰り返しの予定の ID と最初の日付を返す', async () => {
    const sent: unknown[] = []
    server.use(
      scheduleHttp.put(
        '/v1/schedules/recurring/{recurring_schedule_id}/rule',
        async ({ params, request, response }) => {
          sent.push({ id: params.recurring_schedule_id, body: await request.json() })
          return response(200).json({
            ...schedule('01M3TC6E9G4N8Q2R5T7V9W1X41', { date: '2026-10-21' }),
            recurring_rule: { frequency: 'weekly', days_of_week: [3], interval: 1 },
            exclusion_dates: [],
          })
        },
      ),
    )
    const changed = await api().schedules.changeRule(
      'facility-1',
      '01M3TC6E9G4N8Q2R5T7V9W1X3Y',
      {
        effectiveDate: '2026-10-20',
        firstWeekDate: '2026-10-19',
        rule: {
          frequency: 'weekly',
          daysOfWeek: [3],
          interval: 1,
          dayOfWeek: null,
          dayOfMonth: null,
          weekOfMonth: null,
          endDate: null,
        },
        id: '01M3TC6E9G4N8Q2R5T7V9W1X41',
      },
      '"parent"',
    )
    expect(changed).toEqual({ id: '01M3TC6E9G4N8Q2R5T7V9W1X41', date: '2026-10-21' })
    expect(sent).toEqual([
      {
        id: '01M3TC6E9G4N8Q2R5T7V9W1X3Y',
        body: {
          effective_date: '2026-10-20',
          first_week_date: '2026-10-19',
          recurring_rule: {
            frequency: 'weekly',
            days_of_week: [3],
            interval: 1,
            day_of_week: null,
            day_of_month: null,
            week_of_month: null,
            end_date: null,
          },
          id: '01M3TC6E9G4N8Q2R5T7V9W1X41',
          etag: '"parent"',
        },
      },
    ])
  })

  it('マスタの ID を引いて予定を作る', async () => {
    server.use(
      ...masters([{ id: 'type-normal', name: '通常' }]),
      scheduleHttp.post('/v1/facilities/{facility_id}/schedules', async ({ request, response }) => {
        const sentBodies = await request.json()
        return sentBodies.schedule_type_id === 'type-normal' &&
          sentBodies.date === '2026-10-20' &&
          sentBodies.id === '01M3TC6CX4Y3D0KCGJ5A9N0WQZ'
          ? response(201).json(schedule('created', { start_time: '15:00', end_time: '16:00' }))
          : response(400).json(invalid('種類か日付が違う'))
      }),
    )
    const created = await api().schedules.create(
      'facility-1',
      {
        kind: 'normal',
        title: '研修',
        staffId: 'staff-1',
        startsAt: '2026-10-20T15:00:00+09:00',
        endsAt: '2026-10-20T16:00:00+09:00',
        description: '',
      },
      '01M3TC6CX4Y3D0KCGJ5A9N0WQZ',
    )
    expect(created).toMatchObject({ id: 'created', startsAt: '2026-10-20T15:00:00+09:00' })
  })

  it('職員の名前とチームを画面の型にし、名前は API に送らず部分一致で絞る', async () => {
    const staff = (id: string, username: string) => ({
      id,
      username,
      email: `${id}@example.com`,
      phone_number: null,
      status: 'active' as const,
      leave_started_at: null,
      leave_return_date: null,
      retired_at: null,
      facility_id: 'facility-1',
      department: { id: 'department-1', name: '訪問看護部' },
      team: { id: 'team-a', name: 'A' },
      position: { id: 'position-1', name: '看護師' },
      visits: true,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    })
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/users', ({ request, response }) =>
        new URL(request.url).searchParams.has('username')
          ? response(400).json(invalid('名前を API に送っている'))
          : response(200).json([staff('staff-1', '青木 一郎'), staff('staff-2', '石田 二郎')]),
      ),
    )
    await expect(api().staff.list('facility-1', { name: '青木' })).resolves.toEqual([
      { id: 'staff-1', name: '青木 一郎', teamId: 'team-a', email: 'staff-1@example.com' },
    ])
    await expect(api().staff.list('facility-1', { name: '' })).resolves.toHaveLength(2)
  })

  it('休職と退職の職員は、状態を付けて返す。退職した職員のメールは null のまま返す', async () => {
    const base = {
      phone_number: null,
      facility_id: 'facility-1',
      department: { id: 'department-1', name: '訪問看護部' },
      team: { id: 'team-a', name: 'A' },
      position: { id: 'position-1', name: '看護師' },
      visits: true,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    }
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/users', ({ response }) =>
        response(200).json([
          {
            ...base,
            id: 'staff-1',
            username: '青木 一郎',
            email: 'staff-1@example.com',
            status: 'on_leave',
            leave_started_at: '2026-10-01T09:00:00Z',
            leave_return_date: '2027-04-01',
            retired_at: null,
          },
          {
            ...base,
            id: 'staff-2',
            username: '石田 二郎',
            email: null,
            status: 'retired',
            leave_started_at: null,
            leave_return_date: null,
            retired_at: '2026-10-01T09:00:00Z',
          },
        ]),
      ),
    )
    await expect(api().staff.list('facility-1')).resolves.toEqual([
      {
        id: 'staff-1',
        name: '青木 一郎',
        teamId: 'team-a',
        email: 'staff-1@example.com',
        status: 'on_leave',
      },
      { id: 'staff-2', name: '石田 二郎', teamId: 'team-a', email: null, status: 'retired' },
    ])
  })

  it('利用者は利用の終了の利用者を含めて取り、名前の一部で絞る', async () => {
    const patient = (id: string, name: string, ended_at: string | null = null) => ({
      id,
      facility_id: 'facility-1',
      name,
      preferred_time: '午前' as const,
      preferred_gender: '女性' as const,
      service_code_id: 'code-1',
      service_code: '訪看I2',
      assigned_staff_id: 'staff-1',
      assigned_staff_name: '青木 一郎',
      ended_at,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    })
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/patients', ({ request, response }) => {
        const query = new URL(request.url).searchParams
        if (query.has('name')) return response(400).json(invalid('名前を API に送っている'))
        if (query.get('include_ended') !== 'true') {
          return response(400).json(invalid('利用の終了の利用者を含めていない'))
        }
        return response(200).json([
          patient('patient-1', '利用者 A'),
          patient('patient-2', '利用者 B'),
          patient('patient-3', '利用者 B2', '2026-10-31T00:00:00Z'),
        ])
      }),
    )
    await expect(api().patients.list('facility-1', { name: 'B' })).resolves.toEqual([
      { id: 'patient-2', name: '利用者 B', serviceCode: '訪看I2' },
      { id: 'patient-3', name: '利用者 B2', serviceCode: '訪看I2', ended: true },
    ])
  })

  it('マスタの ID を引いて予定を置き換える', async () => {
    server.use(
      ...masters([{ id: 'type-normal', name: '通常' }]),
      scheduleHttp.get('/v1/schedules/{schedule_id}', ({ response }) =>
        response(200).json(schedule('target')),
      ),
      scheduleHttp.put('/v1/schedules/{schedule_id}', async ({ request, response }) => {
        const sentBodies = await request.json()
        return sentBodies.schedule_type_id === 'type-normal' &&
          sentBodies.title === '研修' &&
          sentBodies.etag === '"read"'
          ? response(200).json(schedule('target', { title: '研修' }))
          : response(400).json(invalid('種類かタイトルが違う'))
      }),
    )
    const updated = await api().schedules.update(
      'facility-1',
      'target',
      {
        kind: 'normal',
        title: '研修',
        staffId: 'staff-1',
        startsAt: '2026-10-20T09:00:00+09:00',
        endsAt: '2026-10-20T10:00:00+09:00',
        description: '',
      },
      '"read"',
    )
    expect(updated).toMatchObject({ id: 'target', title: '研修' })
  })

  it('訪問の予定を置き換えるときに同行者とタイトルと別の担当を引き継ぎ、409 で ApiError を投げる', async () => {
    const visitInfo = {
      id: 'vi',
      patient_id: 'patient-1',
      patient_name: '',
      assigned_staff_id: 'staff-9',
      assigned_staff_name: '',
      companion_id: 'staff-3',
      companion_name: '',
      service_code_id: 'code-1',
      service_code: '訪看I2',
      visit_categories: [],
    }
    const visit = schedule('visit', {
      schedule_type: '訪問',
      schedule_type_id: 'type-visit',
      title: null,
      visit_info: visitInfo,
    })
    server.use(
      ...masters([{ id: 'type-visit', name: '訪問' }], [{ id: 'code-1', code: '訪看I2' }]),
      scheduleHttp.get('/v1/schedules/{schedule_id}', ({ params, response }) =>
        response(200).json(params.schedule_id === 'visit' ? visit : schedule('cancelled')),
      ),
      scheduleHttp.put('/v1/schedules/{schedule_id}', async ({ params, request, response }) => {
        if (params.schedule_id === 'cancelled') {
          return response(409).json({ code: 'conflict', message: 'キャンセル済み' })
        }
        const sentBodies = await request.json()
        return sentBodies.title === null &&
          sentBodies.visit_info?.companion_id === 'staff-3' &&
          sentBodies.visit_info.assigned_staff_id === 'staff-9'
          ? response(200).json(visit)
          : response(400).json(invalid('同行者、タイトル、別の担当を引き継いでいない'))
      }),
    )
    const input = {
      kind: 'visit' as const,
      title: '訪問',
      staffId: 'staff-1',
      startsAt: '2026-10-20T09:00:00+09:00',
      endsAt: '2026-10-20T09:30:00+09:00',
      description: '',
      visit: { patientId: 'patient-1', serviceCode: '訪看I2' as const, categories: [] },
    }
    await expect(api().schedules.update('facility-1', 'visit', input, null)).resolves.toMatchObject(
      {
        id: 'visit',
      },
    )
    await expect(
      api().schedules.update('facility-1', 'cancelled', input, null),
    ).rejects.toHaveProperty('status', 409)
  })

  it('失敗の状態と、ほかの事業所の予定で ApiError を投げる', async () => {
    server.use(
      scheduleHttp.get('/v1/schedules/{schedule_id}', ({ params, response }) =>
        params.schedule_id === 'other'
          ? response(200).json(schedule('other', { facility_id: 'facility-2' }))
          : response(404).json({ code: 'not_found', message: 'ない' }),
      ),
    )
    await expect(api().schedules.get('facility-1', 'missing')).rejects.toMatchObject(
      new ApiError(404, 'ない', [], 'not_found'),
    )
    await expect(api().schedules.get('facility-1', 'other')).rejects.toHaveProperty('status', 403)
  })

  it('カレンダーのプレビューと取り込みを送り、409 の原因を code で投げる', async () => {
    server.use(
      scheduleHttp.post('/v1/external_calendars/{external_calendar_id}/imports', ({ response }) =>
        response(409).json({ code: 'import_running', message: '進んでいます' }),
      ),
    )
    const range = { range_start: '2026-11-01', range_end: '2026-11-30' }
    const preview = await authorizedApi().calendars.preview('facility-1', 'calendar-1', range)
    expect(preview).toMatchObject({ ...range, counts: { needs_review: 2 } })
    await expect(
      api().calendars.import('facility-1', 'calendar-1', { ...range, decisions: [] }),
    ).rejects.toMatchObject({ status: 409, code: 'import_running' })
  })

  it('カレンダーの確認と外すは、本文の無い成功で終わる', async () => {
    const authorized = authorizedApi()
    await expect(
      authorized.calendars.check('facility-1', 'staff-1@example.com'),
    ).resolves.toBeUndefined()
    await expect(authorized.calendars.unlink('facility-1', 'calendar-1')).resolves.toBeUndefined()
    await expect(authorized.calendars.serviceAccount('facility-1')).resolves.toMatch(
      /@example\.iam/,
    )
  })
})

describe('createHttpBuddyApi の職員の管理', () => {
  const staffDetail = (
    id: string,
    overrides: Partial<components['schemas']['StaffDetail']> = {},
  ): components['schemas']['StaffDetail'] => ({
    id,
    username: id,
    email: `${id}@example.com`,
    phone_number: null,
    facility_id: 'facility-1',
    department: { id: 'department-1', name: '看護部' },
    team: { id: 'team-1', name: '東チーム' },
    position: { id: 'position-1', name: 'メンバー' },
    visits: true,
    status: 'active',
    leave_started_at: null,
    leave_return_date: null,
    retired_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    sub: null,
    policies: [],
    ...overrides,
  })
  const assignments = {
    schedules: [
      {
        id: 'schedule-1',
        date: '2026-11-02',
        start_time: '09:00',
        end_time: '10:00',
        ends_next_day: false,
      },
    ],
    recurring_schedules: [],
    patients: [],
  }

  it('職員の一覧を名前の昇順で求める', async () => {
    let query = ''
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/users', ({ request, response }) => {
        query = new URL(request.url).search
        return response(200).json([])
      }),
    )
    await api().staff.listRecords('facility-1')
    expect(query).toBe('?sort_field=username&sort_order=asc')
  })

  it('ほかの事業所の職員を読むと 403 の ApiError を投げる', async () => {
    server.use(
      scheduleHttp.get('/v1/users/{user_id}', ({ params, response }) =>
        response(200).json(
          staffDetail(params.user_id, {
            facility_id: params.user_id === 'other' ? 'facility-2' : 'facility-1',
          }),
        ),
      ),
    )
    await expect(api().staff.get('facility-1', 'staff-1')).resolves.toMatchObject({
      id: 'staff-1',
    })
    await expect(api().staff.get('facility-1', 'other')).rejects.toHaveProperty('status', 403)
  })

  it('休職は戻る予定の日を送り、休職にした職員を返す', async () => {
    let sentBodies: unknown
    server.use(
      scheduleHttp.post('/v1/users/{user_id}/leave', async ({ params, request, response }) => {
        sentBodies = await request.json()
        return response(200).json({
          staff: staffDetail(params.user_id, { status: 'on_leave' }),
          assignments,
        })
      }),
    )
    await expect(
      api().staff.startLeave('facility-1', 'staff-1', '2027-04-01'),
    ).resolves.toMatchObject({ id: 'staff-1', status: 'on_leave' })
    expect(sentBodies).toEqual({ return_date: '2027-04-01' })
  })

  it('退職は、予定が残って拒まれると残るものを返し、ほかの 409 は ApiError で投げる', async () => {
    server.use(
      scheduleHttp.post('/v1/users/{user_id}/retire', ({ params, response }) => {
        if (params.user_id === 'busy')
          return response(409).json({
            code: 'staff_has_assignments',
            message: '残っています',
            assignments,
          })
        if (params.user_id === 'self')
          return response(409).json({ code: 'conflict', message: '自分は退職にできません' })
        return response(200).json({
          staff: staffDetail(params.user_id, { status: 'retired', email: null }),
          assignments: { schedules: [], recurring_schedules: [], patients: [] },
        })
      }),
    )
    await expect(api().staff.retire('facility-1', 'busy')).resolves.toEqual({ assignments })
    await expect(api().staff.retire('facility-1', 'staff-1')).resolves.toMatchObject({
      retired: { id: 'staff-1', status: 'retired' },
    })
    await expect(api().staff.retire('facility-1', 'self')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    })
  })
})

describe('createHttpBuddyApi の利用者の管理', () => {
  const patient = (
    id: string,
    overrides: Partial<components['schemas']['Patient']> = {},
  ): components['schemas']['Patient'] => ({
    id,
    facility_id: 'facility-1',
    name: id,
    preferred_time: '午前',
    preferred_gender: '女性',
    service_code_id: 'code-i2',
    service_code: '訪看I2',
    assigned_staff_id: 'staff-1',
    assigned_staff_name: '青木 一郎',
    ended_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  })
  const remaining = {
    schedules: [
      {
        id: 'schedule-1',
        date: '2026-11-02',
        start_time: '09:00',
        end_time: '09:29',
        ends_next_day: false,
      },
    ],
    recurring_schedules: [],
  }

  it('利用者の一覧を、利用の終了の利用者を含めて名前の昇順で求める', async () => {
    let query = ''
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/patients', ({ request, response }) => {
        query = new URL(request.url).search
        return response(200).json([])
      }),
    )
    await api().patients.listRecords('facility-1')
    expect(query).toBe('?include_ended=true&sort_field=name&sort_order=asc')
  })

  it('ほかの事業所の利用者を読むと 403 の ApiError を投げる', async () => {
    server.use(
      scheduleHttp.get('/v1/patients/{patient_id}', ({ params, response }) =>
        response(200).json(
          patient(params.patient_id, {
            facility_id: params.patient_id === 'other' ? 'facility-2' : 'facility-1',
          }),
        ),
      ),
    )
    await expect(api().patients.get('facility-1', 'patient-1')).resolves.toMatchObject({
      id: 'patient-1',
    })
    await expect(api().patients.get('facility-1', 'other')).rejects.toHaveProperty('status', 403)
  })

  it('利用の終了は、予定が残って拒まれると残る予定を返し、ほかの失敗は ApiError で投げる', async () => {
    server.use(
      scheduleHttp.post('/v1/patients/{patient_id}/end_service', ({ params, response }) => {
        if (params.patient_id === 'busy')
          return response(409).json({
            code: 'patient_has_schedules',
            message: '残っています',
            schedules: remaining,
          })
        if (params.patient_id === 'missing')
          return response(404).json({ code: 'not_found', message: 'リソースが見つかりません' })
        return response(200).json(patient(params.patient_id, { ended_at: '2026-10-31T15:00:00Z' }))
      }),
    )
    await expect(api().patients.endService('facility-1', 'busy')).resolves.toEqual({
      schedules: remaining,
    })
    await expect(api().patients.endService('facility-1', 'patient-1')).resolves.toMatchObject({
      ended: { id: 'patient-1', ended_at: '2026-10-31T15:00:00Z' },
    })
    await expect(api().patients.endService('facility-1', 'missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
  })

  it('利用の再開は担当の職員を送り、担当に休職の職員を指した 400 は code を付けて投げる', async () => {
    const sentBodies: unknown[] = []
    server.use(
      scheduleHttp.post(
        '/v1/patients/{patient_id}/resume_service',
        async ({ params, request, response }) => {
          const body = await request.json()
          sentBodies.push(body)
          if (body.assigned_staff_id === 'on-leave')
            return response(400).json(invalid('休職か退職の職員は担当にできません'))
          return response(200).json(
            patient(params.patient_id, { assigned_staff_id: body.assigned_staff_id }),
          )
        },
      ),
    )
    await expect(
      api().patients.resumeService('facility-1', 'patient-1', 'staff-2'),
    ).resolves.toMatchObject({ assigned_staff_id: 'staff-2', ended_at: null })
    await expect(
      api().patients.resumeService('facility-1', 'patient-1', 'on-leave'),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_input' })
    expect(sentBodies).toEqual([
      { assigned_staff_id: 'staff-2' },
      { assigned_staff_id: 'on-leave' },
    ])
  })
})

describe('部署とチームの作成と変更', () => {
  const now = '2026-11-01T00:00:00Z'
  const unit = (id: string, name: string) => ({
    id,
    facility_id: 'facility-1',
    name,
    created_at: now,
    updated_at: now,
  })

  it('部署を作り、名前を変え、返った部署の ID と名前を返す', async () => {
    const sentBodies: unknown[] = []
    server.use(
      scheduleHttp.post(
        '/v1/facilities/{facility_id}/departments',
        async ({ request, response }) => {
          sentBodies.push(await request.json())
          return response(201).json(unit('department-9', '外来'))
        },
      ),
      scheduleHttp.put('/v1/departments/{department_id}', async ({ params, request, response }) => {
        sentBodies.push(await request.json())
        return response(200).json(unit(params.department_id, '訪問'))
      }),
    )
    await expect(api().departments.create('facility-1', '外来')).resolves.toEqual({
      id: 'department-9',
      name: '外来',
    })
    await expect(api().departments.update('facility-1', 'department-9', '訪問')).resolves.toEqual({
      id: 'department-9',
      name: '訪問',
    })
    expect(sentBodies).toEqual([{ name: '外来' }, { name: '訪問' }])
  })

  it('チームを名前と色で作り、変え、同じ名前の 409 は code を付けて投げる', async () => {
    const sentBodies: unknown[] = []
    server.use(
      scheduleHttp.post('/v1/facilities/{facility_id}/teams', async ({ request, response }) => {
        sentBodies.push(await request.json())
        return response(201).json({ ...unit('team-9', 'C チーム'), color: 'cyan' as const })
      }),
      scheduleHttp.put('/v1/teams/{team_id}', async ({ params, request, response }) => {
        if (params.team_id === 'dup')
          return response(409).json({ code: 'conflict', message: 'すでにあります' })
        sentBodies.push(await request.json())
        return response(200).json({ ...unit(params.team_id, 'D チーム'), color: 'lime' as const })
      }),
    )
    await expect(
      api().teams.create('facility-1', { name: 'C チーム', color: 'cyan' }),
    ).resolves.toEqual({ id: 'team-9', name: 'C チーム', color: 'cyan' })
    await expect(
      api().teams.update('facility-1', 'team-9', { name: 'D チーム', color: 'lime' }),
    ).resolves.toEqual({ id: 'team-9', name: 'D チーム', color: 'lime' })
    expect(sentBodies).toEqual([
      { name: 'C チーム', color: 'cyan' },
      { name: 'D チーム', color: 'lime' },
    ])
    await expect(
      api().teams.update('facility-1', 'dup', { name: 'A', color: 'blue' }),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' })
  })
})
