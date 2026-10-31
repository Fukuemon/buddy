// @vitest-environment node
import createClient from 'openapi-fetch'
import { describe, expect, it } from 'vite-plus/test'

import type { paths } from '#/api/generated/schedule'
import { TEST_SCHEDULE_URL } from '#/test/server'

const client = () =>
  createClient<paths>({ baseUrl: TEST_SCHEDULE_URL, headers: { Authorization: 'Bearer test' } })

const body = {
  username: '青木 ひな',
  phone_number: '09012345678',
  department_id: 'department-1',
  team_id: 'team-b',
}

describe('PUT /v1/users/{user_id} のフェイク', () => {
  it('本文の名前、電話番号、チームにした職員を返す', async () => {
    const { data, response } = await client().PUT('/v1/users/{user_id}', {
      params: { path: { user_id: 'staff-1' } },
      body,
    })
    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      id: 'staff-1',
      username: '青木 ひな',
      phone_number: '09012345678',
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

  it('無い職員を指すと 404 を返す', async () => {
    const { response } = await client().PUT('/v1/users/{user_id}', {
      params: { path: { user_id: 'staff-missing' } },
      body,
    })
    expect(response.status).toBe(404)
  })
})
