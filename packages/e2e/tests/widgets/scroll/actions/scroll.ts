import type { Locator, Page } from '@playwright/test'

import { watchScrollIdle } from '../waits/scroll'

/**
 * 横にスクロールする要素を右端まで送り、スクロールが止まるまで待つ。
 * 既に右端にあって送れなかったときは、待たずに返る。
 *
 * @param target overflow で横にスクロールする要素
 * @returns 送った後の scrollLeft。送れなかったときは送る前の値になる
 */
export const scrollToRightEnd = async (target: Locator): Promise<number> => {
  const idle = await watchScrollIdle(target.page())
  const { before, after } = await target.evaluate((element) => {
    const start = element.scrollLeft
    element.scrollLeft = element.scrollWidth
    return { before: start, after: element.scrollLeft }
  })
  if (after !== before) await idle()
  return after
}

/**
 * マウスの今の位置でホイールを回し、スクロールが止まるまで待つ。
 * 送る要素の上にマウスを置くときは、先に hover する。
 *
 * @param delta.x 右へ送る量（px）。負の値で左へ送る
 * @param delta.y 下へ送る量（px）。負の値で上へ送る
 */
export const wheel = async (page: Page, delta: { x?: number; y?: number }): Promise<void> => {
  const idle = await watchScrollIdle(page)
  await page.mouse.wheel(delta.x ?? 0, delta.y ?? 0)
  await idle()
}
