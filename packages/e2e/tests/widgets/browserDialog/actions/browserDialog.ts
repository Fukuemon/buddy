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
 * open を呼んで出たブラウザの確認のダイアログを、文が expected のときだけ「OK」で閉じ、ダイアログの文を返す。
 * 文が違えば、意図しないダイアログでデータを変えないよう「キャンセル」で閉じる。
 * widgets は確認を持たないので、呼ぶ側が返した文を expect で expected と比べる。
 *
 * @param expected 「OK」を押してよいダイアログの文
 * @param open ダイアログを出す操作。字幕を出してからボタンを押すときは、両方をこの中に書く
 */
export const acceptBrowserDialog = (
  page: Page,
  expected: string,
  open: () => Promise<void>,
): Promise<string> =>
  closeBrowserDialog(page, open, (dialog) =>
    dialog.message() === expected ? dialog.accept() : dialog.dismiss(),
  )

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
