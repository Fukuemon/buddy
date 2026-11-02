import { describe, expect, it } from 'vite-plus/test'

import { FAKE_FACILITY_ID } from './fake/fixtures'
import { createDeferredFakeApis } from './loadFake'

describe('createDeferredFakeApis', () => {
  it('メソッドを呼ぶと、fake の実装を読み込んで結果を返す', async () => {
    const { api } = createDeferredFakeApis()
    const staff = await api.staff.list(FAKE_FACILITY_ID)
    expect(staff.length).toBeGreaterThan(0)
  })

  it('作った後の呼び出しは、同じメモリのデータに対して行う', async () => {
    const { api } = createDeferredFakeApis()
    const created = await api.teams.create(FAKE_FACILITY_ID, {
      name: '新しいチーム',
      color: 'lime',
    })
    const teams = await api.teams.list(FAKE_FACILITY_ID)
    expect(teams.map((team) => team.id)).toContain(created.id)
  })

  it('同じグループは、毎回同じ値を返す', () => {
    const { api } = createDeferredFakeApis()
    expect(api.staff).toBe(api.staff)
  })

  it('then を持たないので、Promise の値として待っても API のまま返る', async () => {
    const { api } = createDeferredFakeApis()
    expect(await Promise.resolve(api)).toBe(api)
    expect(await Promise.resolve(api.staff)).toBe(api.staff)
  })

  it('照合の API も、呼んだときに読み込む', async () => {
    const { receiptApi } = createDeferredFakeApis()
    const report = await receiptApi.check({ visits: new Blob(), month: '2026-10' })
    expect(report.rows.length).toBeGreaterThan(0)
  })
})
