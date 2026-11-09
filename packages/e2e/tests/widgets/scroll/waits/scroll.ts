import type { Page } from '@playwright/test'

/** スクロールが始まらないと判断するまでの、待ち始めてからのフレームの数 */
const FRAMES_WITHOUT_SCROLL = 10

/** スクロールが止まったと判断する、scroll のイベントが続けて来ないフレームの数 */
const QUIET_FRAMES = 2

type ScrollWatch = Window & {
  __e2eScrolledAt?: number
  __e2eStopScrollWatch?: () => void
}

/**
 * ページの中のどこかのスクロールを見張り始め、止まるまで待つ関数を返す。スクロールの操作の前に呼び、返った関数を操作の後に待つ。
 * スクロールの位置は DOM に出ないので、scroll のイベントが来なくなったことをフレームの数で判定する。
 * 操作でスクロールしなかったとき（端に着いていたとき）は、待ち始めてから FRAMES_WITHOUT_SCROLL のフレームの後に返る。
 * 見張りは、返った関数が返るときに外す。
 */
export const watchScrollIdle = async (page: Page): Promise<() => Promise<void>> => {
  await page.evaluate(() => {
    const w = window as ScrollWatch
    w.__e2eStopScrollWatch?.()
    w.__e2eScrolledAt = 0
    const onScroll = () => {
      w.__e2eScrolledAt = performance.now()
    }
    document.addEventListener('scroll', onScroll, { capture: true })
    w.__e2eStopScrollWatch = () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      w.__e2eStopScrollWatch = undefined
    }
  })
  return () =>
    page.evaluate(
      ({ framesWithoutScroll, quietFrames }) =>
        new Promise<void>((resolve) => {
          const w = window as ScrollWatch
          let frames = 0
          let quiet = 0
          let last = w.__e2eScrolledAt ?? 0
          const tick = () => {
            frames += 1
            const at = w.__e2eScrolledAt ?? 0
            quiet = at === last ? quiet + 1 : 0
            last = at
            if ((at > 0 && quiet >= quietFrames) || (at === 0 && frames >= framesWithoutScroll)) {
              w.__e2eStopScrollWatch?.()
              resolve()
              return
            }
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      { framesWithoutScroll: FRAMES_WITHOUT_SCROLL, quietFrames: QUIET_FRAMES },
    )
}
