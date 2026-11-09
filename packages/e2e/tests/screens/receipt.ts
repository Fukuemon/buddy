import type { Page } from '@playwright/test'

/**
 * 照合の結果の画面で、表示する行を「全ての行」に切り替える。開いたときは確認が要る行だけが出て、注意の無い整合の行は出ない。
 * 選んだ選択肢が checked になるまで待つ。
 */
export const showAllReceiptRows = async (page: Page) => {
  const all = page.getByTestId('receipt-row-view-all')
  await all.check()
}
