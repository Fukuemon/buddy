import { readFile } from 'node:fs/promises'

import type { Locator } from '@playwright/test'

import { waitForDownload } from '../waits/download'

/**
 * ダウンロードのボタンを押し、ダウンロードが終わったファイルの中身を返す。
 * ダウンロードしたファイルは画面に出ないので、中身の確認は返したバイト列で行う。
 *
 * @param button 押すとダウンロードが始まるボタン
 */
export const downloadFile = async (button: Locator): Promise<Buffer> => {
  const [download] = await Promise.all([waitForDownload(button.page()), button.click()])
  return readFile(await download.path())
}
