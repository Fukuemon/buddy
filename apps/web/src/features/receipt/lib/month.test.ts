import { describe, expect, it } from 'vite-plus/test'

import { dateStamp, isMonth, previousMonth } from './month'

describe('previousMonth', () => {
  it('前の月を返し、1 月なら前の年の 12 月にする', () => {
    expect(previousMonth(new Date(2026, 9, 21))).toBe('2026-09')
    expect(previousMonth(new Date(2026, 0, 5))).toBe('2025-12')
  })
})

describe('isMonth', () => {
  it('YYYY-MM の月だけを受ける', () => {
    expect(isMonth('2026-09')).toBe(true)
    for (const bad of ['2026-13', '2026-9', '', '2026-09-01']) expect(isMonth(bad)).toBe(false)
  })
})

describe('dateStamp', () => {
  it('YYYY-MM-DD にする', () => {
    expect(dateStamp(new Date(2026, 9, 1))).toBe('2026-10-01')
  })
})
