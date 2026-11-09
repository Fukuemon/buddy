import type { Locator } from '@playwright/test'

/**
 * 入力の欄が、入れた値を出すまで待つ。欄は input の要素ではないので、値ではなく出た文字で待つ。
 *
 * @param field 値を入れた欄
 * @param value 入れた値
 */
export const waitForFieldValue = (field: Locator, value: string): Promise<void> =>
  field.filter({ hasText: value }).waitFor()

/**
 * レスポンスの本文の行が描かれるまで待つ。本文は見えている行だけを描くので、画面の外の行はスクロールするまで DOM に無い。
 * 描かれないままなら、Playwright の操作のタイムアウトで失敗する。
 *
 * @param line 待つ行
 */
export const waitForResponseLine = (line: Locator): Promise<void> => line.waitFor()
