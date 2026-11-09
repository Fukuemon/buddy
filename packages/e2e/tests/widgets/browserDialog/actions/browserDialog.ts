import type { Dialog, Page } from '@playwright/test'

import { waitForBrowserDialog } from '../waits/browserDialog'

/** open を呼んで出たブラウザのダイアログを close で閉じ、ダイアログの文を返す。 */
const closeBrowserDialog = async (
  page: Page,
  open: () => Promise<void>,
  close: (dialog: Dialog) => Promise<void>,
): Promise<string> => {
  const [message] = await Promise.all([
    waitForBrowserDialog(page).then(async (dialog) => {
      const text = dialog.message()
      await close(dialog)
      return text
    }),
    open(),
  ])
  return message
}

/**
 * open を呼んで出たブラウザの確認のダイアログを「キャンセル」で閉じ、ダイアログの文を返す。
 * ブラウザのダイアログは DOM に出ず、録画にも映らないので、文の確認は返した文で行う。
 *
 * @param open ダイアログを出す操作。字幕を出してからボタンを押すときは、両方をこの中に書く
 */
export const dismissBrowserDialog = (page: Page, open: () => Promise<void>): Promise<string> =>
  closeBrowserDialog(page, open, (dialog) => dialog.dismiss())

/**
 * open を呼んで出たブラウザの確認のダイアログを「OK」で閉じ、ダイアログの文を返す。
 * ダイアログは押す前に文を確認できないので、呼ぶ側は返した文を expect で確認し、意図しないダイアログを押していないことを示す。
 *
 * @param open ダイアログを出す操作。字幕を出してからボタンを押すときは、両方をこの中に書く
 */
export const acceptBrowserDialog = (page: Page, open: () => Promise<void>): Promise<string> =>
  closeBrowserDialog(page, open, (dialog) => dialog.accept())

/**
 * これから出るブラウザのダイアログを全て「キャンセル」で閉じ、出た文を順に積む配列を返す。
 * ダイアログが出ないことを確認するときに、操作の前に呼ぶ。配列の確認は、操作の結果が画面に出てから行う。
 */
export const recordBrowserDialogs = (page: Page): string[] => {
  const messages: string[] = []
  page.on('dialog', (dialog) => {
    messages.push(dialog.message())
    void dialog.dismiss()
  })
  return messages
}
