import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { nowForDay, useNow } from './useNow'

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 10, 15, 30))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('分の変わり目にそろえて進め、その後は 1 分ごとに進める', () => {
    const { result } = renderHook(() => useNow())
    expect(result.current.getMinutes()).toBe(15)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(result.current.getMinutes()).toBe(16)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.getMinutes()).toBe(17)
  })

  it('アンマウントするとタイマーを止める', () => {
    const { unmount } = renderHook(() => useNow())
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('nowForDay', () => {
  it('表示している日が今日のときだけ今の時刻を返す', () => {
    const now = new Date(2026, 9, 20, 10, 15)
    expect(nowForDay('2026-10-20', now)).toBe(now)
    expect(nowForDay('2026-10-21', now)).toBeUndefined()
  })
})
