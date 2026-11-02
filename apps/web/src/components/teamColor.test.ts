import { describe, expect, it } from 'vite-plus/test'

import { nextTeamColor } from './teamColor'

describe('nextTeamColor', () => {
  it('チームが無ければ青を選ぶ', () => {
    expect(nextTeamColor([])).toBe('blue')
  })

  it('使っていない色があれば、その先頭の色を選ぶ', () => {
    expect(nextTeamColor([{ color: 'blue' }, { color: 'orange' }, { color: 'magenta' }])).toBe(
      'cyan',
    )
  })

  it('8 色を使っていれば、使っている数が最も少ない色の先頭を選ぶ', () => {
    const all = ['blue', 'orange', 'magenta', 'cyan', 'yellow', 'purple', 'green', 'lime'] as const
    const used = [...all, 'blue', 'cyan'].map((color) => ({ color }))
    expect(nextTeamColor(used as { color: (typeof all)[number] }[])).toBe('orange')
  })
})
