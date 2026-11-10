import type { Browser, BrowserContext, Page, ViewportSize } from '@playwright/test'

import { BASE_URL, TIMEZONE_ID } from './env'

/** パソコンの幅の画面と録画の大きさ。pull request の本文で読める大きさにする */
export const DESKTOP_VIEWPORT: ViewportSize = { width: 1280, height: 800 }

/** スマートフォンの幅の画面と録画の大きさ */
export const PHONE_VIEWPORT: ViewportSize = { width: 390, height: 844 }

/**
 * 録画の外で、テストデータを作るような前準備を行い、prepare の戻り値を返す。
 * 録画するのは fixture の context の page だけなので、前準備は別のコンテキストで行う。
 * fixture の page を開いた後に呼ぶと、前準備の間が録画に空白の画面として残る。spec は fixture の page を受け取らず、
 * この関数を呼んだ後に `context.newPage()` で録画する page を開く。
 *
 * @param o.storageState 前準備のコンテキストのログインの状態のファイル。無ければログインしていない状態で始める
 * @param o.carryLoginTo 渡すと、前準備を終えたコンテキストの cookie をこのコンテキストに移す。
 *   setup の project が保存していない職員（spec の中で作った職員など）で撮るときに、prepare の中でログインして渡す
 * @param prepare 前準備のコンテキストの page で行う処理
 */
export const prepareOutsideRecording = async <T>(
  browser: Browser,
  o: { storageState?: string; carryLoginTo?: BrowserContext },
  prepare: (page: Page) => Promise<T>,
): Promise<T> => {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: o.storageState,
    timezoneId: TIMEZONE_ID,
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
  })
  try {
    const prepared = await prepare(await context.newPage())
    if (o.carryLoginTo) await o.carryLoginTo.addCookies(await context.cookies())
    return prepared
  } finally {
    await context.close()
  }
}
