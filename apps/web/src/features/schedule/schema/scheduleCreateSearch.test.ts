import { describe, expect, it } from 'vite-plus/test'

import { scheduleCreateSearchSchema } from './scheduleCreateSearch'

describe('scheduleCreateSearchSchema', () => {
  it.each(['24:00', '99:99', '9:00', '09:00:00'])('範囲や形の外の time %s は捨てる', (time) => {
    expect(scheduleCreateSearchSchema.parse({ time }).time).toBeUndefined()
  })

  it('HH:mm の time はそのまま受ける', () => {
    expect(scheduleCreateSearchSchema.parse({ time: '23:30' }).time).toBe('23:30')
  })
})
