import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import { pickCalendarSearch, scheduleSearchSchema } from './scheduleSearch'

/** 開いたときの幅を覚える値をテストごとに消すため、モジュールを読み直す。 */
const loadSchema = async () => {
  vi.resetModules()
  return import('./scheduleSearch')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('resolveCalendarView', () => {
  it('幅 768px 未満で開いたときは、省くと日の表示にする', async () => {
    stubViewport(false)
    const { resolveCalendarView, scheduleSearchSchema } = await loadSchema()
    expect(resolveCalendarView(scheduleSearchSchema.parse({}).view)).toBe('day')
  })

  it('幅 768px 以上で開いたときは、省くと月の表示にする', async () => {
    stubViewport(true)
    const { resolveCalendarView, scheduleSearchSchema } = await loadSchema()
    expect(resolveCalendarView(scheduleSearchSchema.parse({}).view)).toBe('month')
  })

  it('開いた後に幅が変わっても、省いたときの表示を変えない', async () => {
    const viewport = stubViewport(false)
    const { resolveCalendarView } = await loadSchema()
    expect(resolveCalendarView(undefined)).toBe('day')
    viewport.resize(true)
    expect(resolveCalendarView(undefined)).toBe('day')
  })

  it('読めない値は、省いたときと同じ表示にする', async () => {
    stubViewport(true)
    const { resolveCalendarView, scheduleSearchSchema } = await loadSchema()
    expect(resolveCalendarView(scheduleSearchSchema.parse({ view: 'year' }).view)).toBe('month')
  })

  it('選んだ値は、幅によらずそのまま使う', async () => {
    stubViewport(false)
    const { resolveCalendarView, scheduleSearchSchema } = await loadSchema()
    expect(resolveCalendarView(scheduleSearchSchema.parse({ view: 'month' }).view)).toBe('month')
  })
})
