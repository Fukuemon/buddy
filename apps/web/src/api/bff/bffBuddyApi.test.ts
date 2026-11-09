// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '../BuddyApi'
import { createBffBuddyApi } from './bffBuddyApi'
import type { BffCall, BffResult } from './bffCall'

describe('createBffBuddyApi', () => {
  it('操作の名前と引数を BFF に渡し、失敗を status つきの ApiError にする', async () => {
    const calls: BffCall[] = []
    const api = createBffBuddyApi(async (call): Promise<BffResult> => {
      calls.push(call)
      return call.op === 'teams.list'
        ? { ok: true, data: [{ id: 'team-a', name: 'A', color: 'blue' }] }
        : { ok: false, status: 404, message: 'ない' }
    })
    await expect(api.teams.list('facility-1')).resolves.toEqual([
      { id: 'team-a', name: 'A', color: 'blue' },
    ])
    await expect(api.schedules.get('facility-1', 'x')).rejects.toEqual(new ApiError(404, 'ない'))
    expect(calls).toEqual([
      { op: 'teams.list', args: ['facility-1'] },
      { op: 'schedules.get', args: ['facility-1', 'x'] },
    ])
  })

  it('全てのメソッドが、グループとメソッドの名前と同じ操作を BFF に渡す', async () => {
    const ops: string[] = []
    const api = createBffBuddyApi(async (call): Promise<BffResult> => {
      ops.push(call.op)
      return { ok: true, data: null }
    })
    const expectedOps: string[] = []
    for (const [group, methods] of Object.entries(api)) {
      for (const [name, method] of Object.entries(
        methods as Record<string, () => Promise<unknown>>,
      )) {
        expectedOps.push(`${group}.${name}`)
        await method()
      }
    }
    expect(ops).toEqual(expectedOps)
  })
})
