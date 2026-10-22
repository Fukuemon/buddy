// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { scheduleHttp, server, TEST_SCHEDULE_API_URL } from '#/test/server'

import { ApiError } from '../client'
import type { components } from '../generated/schedule'
import { createHttpBuddyApi } from './httpBuddyApi'

const api = () => createHttpBuddyApi({ baseUrl: TEST_SCHEDULE_API_URL })

/** BFF と同じく Bearer のトークンを付けて呼ぶ API。共通の handler はトークンを求める。 */
const authorizedApi = () =>
  createHttpBuddyApi({
    baseUrl: TEST_SCHEDULE_API_URL,
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
  is_over_time_work: false,
  staff_id: 'staff-1',
  staff_name: '',
  title: id,
  description: null,
  recurring_schedule_id: null,
  visit_info: null,
  cancel: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

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
            })
          : response(400).json(invalid('期間が日付になっていない')),
      ),
    )
    const list = await api().schedules.list('facility-1', {
      from: '2026-10-20T00:00:00+09:00',
      to: '2026-10-20T12:00:00+09:00',
      staffIds: ['staff-1'],
    })
    expect(list.map((s) => s.id)).toEqual(['keep'])
  })

  it('繰り返しの予定を期間の回に分けて返し、回を読んで置き換える', async () => {
    const rs: components['schemas']['RecurringSchedule'] = {
      ...schedule('01M3TC6E9G4N8Q2R5T7V9W1X3Y', { date: '2026-10-06' }),
      recurring_rule: { frequency: 'weekly' },
      exclusion_dates: ['2026-10-13'],
    }
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/schedules', ({ response }) =>
        response(200).json({ schedules: [], recurring_schedules: [rs] }),
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
    expect(listed.map((s) => s.startsAt.slice(0, 10))).toEqual([
      '2026-10-06',
      '2026-10-20',
      '2026-10-27',
    ])
    const occurrence = await api().schedules.get('facility-1', listed[1].id)
    expect(occurrence.startsAt).toBe('2026-10-20T09:00:00+09:00')
    await expect(
      api().schedules.get('facility-1', listed[1].id.replace('10-20', '10-13')),
    ).rejects.toMatchObject({
      status: 404,
    })
    const replaced = await api().schedules.update('facility-1', listed[1].id, {
      ...occurrence,
      startsAt: '2026-10-20T10:00:00+09:00',
      endsAt: '2026-10-20T11:00:00+09:00',
    })
    expect(replaced.id).toBe('replaced')
  })

  it('マスタの ID を引いて予定を作る', async () => {
    server.use(
      ...masters([{ id: 'type-normal', name: '通常' }]),
      scheduleHttp.post('/v1/facilities/{facility_id}/schedules', async ({ request, response }) => {
        const sent = await request.json()
        return sent.schedule_type_id === 'type-normal' && sent.date === '2026-10-20'
          ? response(201).json(schedule('created', { start_time: '15:00', end_time: '16:00' }))
          : response(400).json(invalid('種類か日付が違う'))
      }),
    )
    const created = await api().schedules.create('facility-1', {
      kind: 'normal',
      title: '研修',
      staffId: 'staff-1',
      startsAt: '2026-10-20T15:00:00+09:00',
      endsAt: '2026-10-20T16:00:00+09:00',
      description: '',
    })
    expect(created).toMatchObject({ id: 'created', startsAt: '2026-10-20T15:00:00+09:00' })
  })

  it('職員の名前とチームを画面の型にし、名前は API に送らず部分一致で絞る', async () => {
    const staff = (id: string, username: string) => ({
      id,
      username,
      email: `${id}@example.com`,
      phone_number: null,
      facility_id: 'facility-1',
      department: { id: 'department-1', name: '訪問看護部' },
      team: { id: 'team-a', name: 'A' },
      position: { id: 'position-1', name: '看護師' },
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

  it('利用者は名前の一部で絞る', async () => {
    const patient = (id: string, name: string) => ({
      id,
      facility_id: 'facility-1',
      name,
      preferred_time: '午前' as const,
      preferred_gender: '女性' as const,
      service_code_id: 'code-1',
      service_code: '訪看I2',
      assigned_staff_id: 'staff-1',
      assigned_staff_name: '青木 一郎',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    })
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/patients', ({ request, response }) =>
        new URL(request.url).searchParams.has('name')
          ? response(400).json(invalid('名前を API に送っている'))
          : response(200).json([
              patient('patient-1', '利用者 A'),
              patient('patient-2', '利用者 B'),
            ]),
      ),
    )
    await expect(api().patients.list('facility-1', { name: 'B' })).resolves.toEqual([
      { id: 'patient-2', name: '利用者 B' },
    ])
  })

  it('マスタの ID を引いて予定を置き換える', async () => {
    server.use(
      ...masters([{ id: 'type-normal', name: '通常' }]),
      scheduleHttp.get('/v1/schedules/{schedule_id}', ({ response }) =>
        response(200).json(schedule('target')),
      ),
      scheduleHttp.put('/v1/schedules/{schedule_id}', async ({ request, response }) => {
        const sent = await request.json()
        return sent.schedule_type_id === 'type-normal' && sent.title === '研修'
          ? response(200).json(schedule('target', { title: '研修' }))
          : response(400).json(invalid('種類かタイトルが違う'))
      }),
    )
    const updated = await api().schedules.update('facility-1', 'target', {
      kind: 'normal',
      title: '研修',
      staffId: 'staff-1',
      startsAt: '2026-10-20T09:00:00+09:00',
      endsAt: '2026-10-20T10:00:00+09:00',
      description: '',
    })
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
        const sent = await request.json()
        return sent.title === null &&
          sent.visit_info?.companion_id === 'staff-3' &&
          sent.visit_info.assigned_staff_id === 'staff-9'
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
    await expect(api().schedules.update('facility-1', 'visit', input)).resolves.toMatchObject({
      id: 'visit',
    })
    await expect(api().schedules.update('facility-1', 'cancelled', input)).rejects.toHaveProperty(
      'status',
      409,
    )
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

  it('カレンダーの確かめと外すは、本文の無い成功で終わる', async () => {
    const authorized = authorizedApi()
    await expect(
      authorized.calendars.check('facility-1', 'staff-1@example.com'),
    ).resolves.toBeUndefined()
    await expect(authorized.calendars.unlink('facility-1', 'calendar-1')).resolves.toBeUndefined()
    await expect(authorized.calendars.serviceAccount('facility-1')).resolves.toMatch(
      /@example\.iam/,
    )
  })

  it('確かめが要る書き出しを Google の内容で解き、合わせられない書き出しは code で投げる', async () => {
    const authorized = authorizedApi()
    await expect(
      authorized.calendars.acceptExport('facility-1', 'export-1'),
    ).resolves.toMatchObject({
      id: 'export-1',
      status: 'succeeded',
    })
    await expect(authorized.calendars.acceptExport('facility-1', 'export-2')).rejects.toMatchObject(
      {
        status: 409,
        code: 'export_not_acceptable',
      },
    )
  })
})
