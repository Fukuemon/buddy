import type { Locator } from '@playwright/test'

/**
 * 一覧の行、行の操作のメニュー、ダイアログのうち、testid を持たない部分。
 * 画面の共通の形（行ごとのボタンが無いこと、メニューの項目の順、ダイアログの × の位置）をエビデンスで確認するために使う。
 */
export const commonShapeParts = (root: Locator) => ({
  /** 行の中のボタン。行を押せる一覧では、行全体を覆う名前のボタンの 1 個だけにする */
  buttons: root.getByRole('button'),
  /** 「…」のメニューの項目。データを失う項目を最後に置く */
  menuItems: root.getByRole('menuitem'),
  /** ダイアログのタイトル */
  title: root.getByRole('heading', { level: 2 }),
})
