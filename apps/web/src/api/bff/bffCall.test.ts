import { describe, expect, it } from 'vite-plus/test'

import { parseBffArgs } from './bffCall'

describe('parseBffArgs', () => {
  it('予定の一覧の includeCancelled を落とさずに渡す', () => {
    const range = { from: '2026-10-20T00:00:00+09:00', to: '2026-10-21T00:00:00+09:00' }
    expect(
      parseBffArgs({
        op: 'schedules.list',
        args: ['01M3TC5H00QV17BC0J9V3393ZP', { ...range, includeCancelled: true }],
      }),
    ).toEqual({
      ok: true,
      args: ['01M3TC5H00QV17BC0J9V3393ZP', { ...range, includeCancelled: true }],
    })
  })
})
