import { describe, expect, it } from 'vite-plus/test'

import { parseBffArgs, parseBffCall } from './bffCall'

describe('parseBffCall', () => {
  it('引数の形を書いた操作を受け、書いていない操作を拒む', () => {
    expect(parseBffCall({ op: 'positions.list', args: ['f'] })).toEqual({
      op: 'positions.list',
      args: ['f'],
    })
    expect(() => parseBffCall({ op: 'positions.delete', args: ['f'] })).toThrow(
      'BFF が中継しない操作 positions.delete',
    )
  })
})

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
