// @vitest-environment node
import createClient from 'openapi-fetch'
import { describe, expect, it } from 'vite-plus/test'

import type { paths } from '#/api/generated/schedule'
import { TEST_SCHEDULE_URL } from '#/test/server'

import { MOCK_FACILITY_ID } from './scheduleData'

const client = () =>
  createClient<paths>({ baseUrl: TEST_SCHEDULE_URL, headers: { Authorization: 'Bearer test' } })

const body = {
  username: '青木 ひな',
  phone_number: '09012345678',
  department_id: 'department-1',
  team_id: 'team-b',
}

describe('職員を変える API と、残る予定の API のフェイク', () => {
  it('PUT /v1/users/{user_id} は、本文の名前、電話番号、チームにした職員を返す', async () => {
    const { data, response } = await client().PUT('/v1/users/{user_id}', {
      params: { path: { user_id: 'staff-1' } },
      body,
    })
    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      id: 'staff-1',
      username: '青木 ひな',
      phone_number: '+09012345678',
      team: { id: 'team-b', name: 'B チーム' },
    })
  })

  it('事業所に無いチームを指すと 400 を返す', async () => {
    const { response } = await client().PUT('/v1/users/{user_id}', {
      params: { path: { user_id: 'staff-1' } },
      body: { ...body, team_id: 'team-other' },
    })
    expect(response.status).toBe(400)
  })

  it('GET /v1/users/{user_id}/remaining_assignments のフェイクは、空の一覧を返す', async () => {
    const { data, response } = await client().GET('/v1/users/{user_id}/remaining_assignments', {
      params: { path: { user_id: 'staff-1' } },
    })
    expect(response.status).toBe(200)
    expect(data).toEqual({ schedules: [], recurring_schedules: [], patients: [] })
  })

  it('無い職員を指すと 404 を返す', async () => {
    const { response } = await client().PUT('/v1/users/{user_id}', {
      params: { path: { user_id: 'staff-missing' } },
      body,
    })
    expect(response.status).toBe(404)
  })
})

describe('利用者の一覧の API のフェイク', () => {
  it('デフォルトは利用中の利用者だけを返し、include_ended=true なら利用の終了の利用者も返す', async () => {
    const list = (include_ended?: boolean) =>
      client().GET('/v1/facilities/{facility_id}/patients', {
        params: { path: { facility_id: MOCK_FACILITY_ID }, query: { include_ended } },
      })
    const active = await list()
    expect(active.data?.map((patient) => patient.id)).not.toContain('patient-ended')
    const all = await list(true)
    expect(all.data?.find((patient) => patient.id === 'patient-ended')?.ended_at).not.toBeNull()
  })
})
