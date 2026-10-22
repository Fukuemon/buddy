import { describe, expect, it } from 'vite-plus/test'

import { pickCalendarSearch, scheduleSearchSchema } from './scheduleSearch'

describe('scheduleSearchSchema', () => {
  it('cancelled を省くと、キャンセルした予定を出さない', () => {
    expect(scheduleSearchSchema.parse({}).cancelled).toBe(false)
  })

  it('cancelled が true なら受け、読めない値なら false にする', () => {
    expect(scheduleSearchSchema.parse({ cancelled: true }).cancelled).toBe(true)
    expect(scheduleSearchSchema.parse({ cancelled: 'yes' }).cancelled).toBe(false)
  })

  it('モーダルを閉じるときも cancelled を引き継ぐ', () => {
    const search = scheduleSearchSchema.parse({ view: 'day', cancelled: true })
    expect(pickCalendarSearch(search).cancelled).toBe(true)
  })
})
