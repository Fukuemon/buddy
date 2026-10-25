import { act } from '@testing-library/react'
import { vi } from 'vite-plus/test'

/**
 * jsdom が持たない matchMedia を差し替え、表示の幅が 768px 以上かを決める。
 * 返す resize で幅を変え、useIsDesktop が受ける change を送る。afterEach で vi.unstubAllGlobals を呼んで戻す。
 */
export const stubViewport = (isDesktop: boolean) => {
  const listeners = new Set<() => void>()
  let matches = isDesktop
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  }))
  return {
    resize: (nextIsDesktop: boolean) => {
      matches = nextIsDesktop
      act(() => {
        for (const listener of listeners) listener()
      })
    },
  }
}
