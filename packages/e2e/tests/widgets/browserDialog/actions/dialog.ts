import type { Page } from '@playwright/test'

import { waitForBrowserDialog } from '../waits/dialog'

/**
 * open を呼んで出たブラウザの確認のダイアログを「キャンセル」で閉じ、ダイアログの文を返す。
 * ブラウザのダイアログは DOM に出ず、録画にも映らないので、文の確認は返した文で行う。
 *
 * @param open ダイアログを出す操作。字幕を出してからボタンを押すときは、両方をこの中に書く
 */
export const dismissBrowserDialog = async (
  page: Page,
  open: () => Promise<void>,
): Promise<string> => {
  const [message] = await Promise.all([
    waitForBrowserDialog(page).then(async (dialog) => {
      const text = dialog.message()
      await dialog.dismiss()
      return text
    }),
    open(),
  ])
  return message
}
