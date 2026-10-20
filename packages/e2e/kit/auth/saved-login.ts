import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Browser, Page } from '@playwright/test'

/**
 * ログインの状態を保存するファイル。`<dir>/<ホスト>/<key>.json` になる。
 * 検証環境とローカル環境で同じユーザーを使えるよう、ホストごとに分ける。ログインの状態は秘密の情報なので、Git で追跡しない。
 * ファイルは本人だけが読める権限(600)にする。
 */
export const savedLoginPath = (dir: string, baseUrl: string, key: string): string =>
  path.join(dir, new URL(baseUrl).host.replace(':', '_'), `${key}.json`)

/**
 * 保存したログインの状態で入れればそれを使い、入れなければログインして状態を保存する。
 * 保存するのは Cookie、localStorage、IndexedDB で、sessionStorage は保存しない。
 * 同じファイルを並列の worker で共有しない。refresh のトークンを使うたびに替えるアプリでは、全部のセッションが失効する。
 *
 * @param o.isLoggedIn ページで、アプリに入れているかを返す。保存した状態を試すときと、ログインした後に確かめるときに呼ぶ
 * @param o.login ページで、ログインを始めてからアプリに入るまでを行う。ID 基盤のログインの画面の操作も、ここで行う
 */
export const ensureSavedLogin = async (
  browser: Browser,
  o: {
    path: string
    baseUrl: string
    isLoggedIn: (page: Page) => Promise<boolean>
    login: (page: Page) => Promise<void>
  },
): Promise<void> => {
  const saved = existsSync(o.path) ? o.path : undefined
  const context = await browser.newContext({ baseURL: o.baseUrl, storageState: saved })
  try {
    const page = await context.newPage()
    if (saved && (await o.isLoggedIn(page))) {
      chmodSync(saved, 0o600)
      return
    }
    await o.login(page)
    if (!(await o.isLoggedIn(page)))
      throw new Error(`ログインした後も、アプリに入れない: ${page.url()}`)
    mkdirSync(path.dirname(o.path), { recursive: true, mode: 0o700 })
    await context.storageState({ path: o.path, indexedDB: true })
    chmodSync(o.path, 0o600)
  } finally {
    await context.close()
  }
}
