// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '../client'
import { createHttpBuddyApi } from './httpBuddyApi'

type Route = (url: URL, request: Request) => unknown

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** パスごとの応答を返す fetch と、受けた要求を作る。 */
const fakeFetch = (routes: Record<string, Route>) => {
  const requests: Request[] = []
  const fetch = async (input: RequestInfo | URL) => {
    const request = input as Request
    requests.push(request)
    const url = new URL(request.url)
    const route = routes[`${request.method} ${url.pathname}`]
    if (route === undefined) return json({ code: 'not_found', message: 'ない' }, 404)
    const body = await route(url, request)
    return body instanceof Response ? body : json(body)
  }
  return { fetch, requests }
}

const schedule = (id: string, overrides: Record<string, unknown> = {}) => ({
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
    const { fetch, requests } = fakeFetch({
      'GET /v1/facilities/facility-1/schedules': () => ({
        schedules: [
          schedule('keep'),
          schedule('cancelled', { cancel: { id: 'c', schedule_id: 'cancelled', reason: '' } }),
          schedule('other-staff', { staff_id: 'staff-2' }),
          schedule('outside', { start_time: '23:00', end_time: '23:30' }),
        ],
        recurring_schedules: [],
      }),
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    const list = await api.schedules.list('facility-1', {
      from: '2026-10-20T00:00:00+09:00',
      to: '2026-10-20T12:00:00+09:00',
      staffIds: ['staff-1'],
    })
    expect(list.map((s) => s.id)).toEqual(['keep'])
    const query = new URL(requests[0].url).searchParams
    expect(query.get('date_from')).toBe('2026-10-20')
    expect(query.get('date_to')).toBe('2026-10-20')
  })

  it('マスタの ID を引いて予定を作る', async () => {
    let sent: unknown
    const { fetch } = fakeFetch({
      'GET /v1/schedule_types': () => [{ id: 'type-normal', name: '通常' }],
      'GET /v1/visit_infos/service_codes': () => [],
      'GET /v1/visit_infos/visit_categories': () => [],
      'POST /v1/facilities/facility-1/schedules': async (_, request) => {
        sent = await request.json()
        return json(schedule('created', { start_time: '15:00', end_time: '16:00' }), 201)
      },
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    const created = await api.schedules.create('facility-1', {
      kind: 'normal',
      title: '研修',
      staffId: 'staff-1',
      startsAt: '2026-10-20T15:00:00+09:00',
      endsAt: '2026-10-20T16:00:00+09:00',
      description: '',
    })
    expect(sent).toMatchObject({ schedule_type_id: 'type-normal', date: '2026-10-20' })
    expect(created).toMatchObject({ id: 'created', startsAt: '2026-10-20T15:00:00+09:00' })
  })

  it('職員の名前とチームを画面の型にし、名前は API に送らず部分一致で絞る', async () => {
    const { fetch, requests } = fakeFetch({
      'GET /v1/facilities/facility-1/users': () => [
        { id: 'staff-1', username: '青木 一郎', team: { id: 'team-a', name: 'A' } },
        { id: 'staff-2', username: '石田 二郎', team: { id: 'team-a', name: 'A' } },
      ],
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    await expect(api.staff.list('facility-1', { name: '青木' })).resolves.toEqual([
      { id: 'staff-1', name: '青木 一郎', teamId: 'team-a' },
    ])
    await expect(api.staff.list('facility-1', { name: '' })).resolves.toHaveLength(2)
    expect(new URL(requests[0].url).searchParams.has('username')).toBe(false)
  })

  it('利用者は名前の一部で絞る', async () => {
    const { fetch, requests } = fakeFetch({
      'GET /v1/facilities/facility-1/patients': () => [
        { id: 'patient-1', name: '利用者 A' },
        { id: 'patient-2', name: '利用者 B' },
      ],
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    await expect(api.patients.list('facility-1', { name: 'B' })).resolves.toEqual([
      { id: 'patient-2', name: '利用者 B' },
    ])
    expect(new URL(requests[0].url).searchParams.has('name')).toBe(false)
  })

  it('マスタの ID を引いて予定を置き換える', async () => {
    let sent: unknown
    const { fetch } = fakeFetch({
      'GET /v1/schedule_types': () => [{ id: 'type-normal', name: '通常' }],
      'GET /v1/visit_infos/service_codes': () => [],
      'GET /v1/visit_infos/visit_categories': () => [],
      'GET /v1/schedules/target': () => schedule('target'),
      'PUT /v1/schedules/target': async (_, request) => {
        sent = await request.json()
        return schedule('target', { title: '研修' })
      },
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    const updated = await api.schedules.update('facility-1', 'target', {
      kind: 'normal',
      title: '研修',
      staffId: 'staff-1',
      startsAt: '2026-10-20T09:00:00+09:00',
      endsAt: '2026-10-20T10:00:00+09:00',
      description: '',
    })
    expect(sent).toMatchObject({ schedule_type_id: 'type-normal', title: '研修' })
    expect(updated).toMatchObject({ id: 'target', title: '研修' })
  })

  it('訪問の予定を置き換えるときに同行者とタイトルと別の担当を引き継ぎ、409 で ApiError を投げる', async () => {
    let sent: { title?: unknown; visit_info?: Record<string, unknown> } = {}
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
    const { fetch } = fakeFetch({
      'GET /v1/schedule_types': () => [{ id: 'type-visit', name: '訪問' }],
      'GET /v1/visit_infos/service_codes': () => [{ id: 'code-1', code: '訪看I2' }],
      'GET /v1/visit_infos/visit_categories': () => [],
      'GET /v1/schedules/visit': () =>
        schedule('visit', { schedule_type: '訪問', title: null, visit_info: visitInfo }),
      'PUT /v1/schedules/visit': async (_, request) => {
        sent = await request.json()
        return schedule('visit', { schedule_type: '訪問', title: null, visit_info: visitInfo })
      },
      'GET /v1/schedules/cancelled': () => schedule('cancelled'),
      'PUT /v1/schedules/cancelled': () =>
        json({ code: 'conflict', message: 'キャンセル済み' }, 409),
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    const input = {
      kind: 'visit' as const,
      title: '訪問',
      staffId: 'staff-1',
      startsAt: '2026-10-20T09:00:00+09:00',
      endsAt: '2026-10-20T09:30:00+09:00',
      description: '',
      visit: { patientId: 'patient-1', serviceCode: '訪看I2' as const, categories: [] },
    }
    await api.schedules.update('facility-1', 'visit', input)
    expect(sent.title).toBeNull()
    expect(sent.visit_info).toMatchObject({ companion_id: 'staff-3', assigned_staff_id: 'staff-9' })
    await expect(api.schedules.update('facility-1', 'cancelled', input)).rejects.toHaveProperty(
      'status',
      409,
    )
  })

  it('失敗の状態と、ほかの事業所の予定で ApiError を投げる', async () => {
    const { fetch } = fakeFetch({
      'GET /v1/schedules/other': () => schedule('other', { facility_id: 'facility-2' }),
    })
    const api = createHttpBuddyApi({ baseUrl: 'http://api.test', fetch })
    await expect(api.schedules.get('facility-1', 'missing')).rejects.toMatchObject(
      new ApiError(404, 'ない'),
    )
    await expect(api.schedules.get('facility-1', 'other')).rejects.toHaveProperty('status', 403)
  })
})
