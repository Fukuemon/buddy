import { describe, expect, it } from 'vite-plus/test'

import { newScheduleId } from './scheduleId'

describe('newScheduleId', () => {
  it('ULID の形（26 文字の Crockford の Base32）で、先頭の 10 文字に時刻を入れる', () => {
    const id = newScheduleId(Date.UTC(2026, 10, 7, 0, 0, 0))
    expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/)
    expect(id.slice(0, 10)).toBe(newScheduleId(Date.UTC(2026, 10, 7, 0, 0, 0)).slice(0, 10))
  })

  it('呼ぶたびに違う ID を作る', () => {
    expect(newScheduleId(0)).not.toBe(newScheduleId(0))
  })
})
