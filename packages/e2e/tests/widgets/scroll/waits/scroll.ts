import type { Page } from '@playwright/test'

import { SCROLL_IDLE_WAIT } from '../../../fixtures/timeouts'

/** スクロールが始まらないと判断するまでの、待ち始めてからのフレームの数 */
const FRAMES_WITHOUT_SCROLL = 10

/** スクロールが止まったと判断する、scroll のイベントが続けて来ないフレームの数 */
const QUIET_FRAMES = 2

type ScrollWatch = Window & {
  __e2eScrolledAt?: number
  __e2eStopScrollWatch?: () => void
  /** 止まるのを待つ間の、数えたフレームの数、scroll のイベントが来ないフレームの数、前のフレームで見た時刻 */
  __e2eScrollIdle?: { frames: number; quiet: number; last: number }
}

/**
 * ページの中のどこかのスクロールを見張り始め、止まるまで待つ関数を返す。スクロールの操作の前に呼び、返った関数を操作の後に待つ。
 * スクロールの位置は DOM に出ないので、scroll のイベントが来なくなったことをフレームの数で判定する。
 * 操作でスクロールしなかったとき（端に着いていたとき）は、待ち始めてから FRAMES_WITHOUT_SCROLL のフレームの後に返る。
 * 返った関数は、SCROLL_IDLE_WAIT の時間を過ぎても止まらないか、描画が止まってフレームが進まないときに、TimeoutError を投げる。
 * 見張りは、返った関数が返るときと投げるときの両方で外す。
 */
export const watchScrollIdle = async (page: Page): Promise<() => Promise<void>> => {
  await page.evaluate(() => {
    const w = window as ScrollWatch
    w.__e2eStopScrollWatch?.()
    w.__e2eScrolledAt = 0
    w.__e2eScrollIdle = undefined
    const onScroll = () => {
      w.__e2eScrolledAt = performance.now()
    }
    document.addEventListener('scroll', onScroll, { capture: true })
    w.__e2eStopScrollWatch = () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      w.__e2eStopScrollWatch = undefined
    }
  })
  return async () => {
    try {
      // polling の raf は、判定を最初の 1 回だけすぐに呼び、その後をフレームごとに呼ぶ。最初の 1 回は待ち始めの値を覚えるだけで、フレームに数えない。
      // 上限は Playwright の側で数えるので、フレームが進まなくても返る
      const handle = await page.waitForFunction(
        ({ framesWithoutScroll, quietFrames }) => {
          const w = window as ScrollWatch
          const at = w.__e2eScrolledAt ?? 0
          const state = w.__e2eScrollIdle
          if (state === undefined) {
            w.__e2eScrollIdle = { frames: 0, quiet: 0, last: at }
            return false
          }
          state.frames += 1
          state.quiet = at === state.last ? state.quiet + 1 : 0
          state.last = at
          return (
            (at > 0 && state.quiet >= quietFrames) ||
            (at === 0 && state.frames >= framesWithoutScroll)
          )
        },
        { framesWithoutScroll: FRAMES_WITHOUT_SCROLL, quietFrames: QUIET_FRAMES },
        { polling: 'raf', ...SCROLL_IDLE_WAIT },
      )
      await handle.dispose()
    } finally {
      await page.evaluate(() => (window as ScrollWatch).__e2eStopScrollWatch?.())
    }
  }
}
