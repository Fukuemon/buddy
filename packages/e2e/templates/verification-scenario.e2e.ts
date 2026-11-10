// 検証のシナリオのエビデンスを撮る spec のテンプレート。context/testing/evidence.md にある spec の配置先にコピーし、<…> を埋める。
// 元は agent-harness のスキル write-verification-spec の references/spec-template.e2e.ts で、buddy の名前と前準備に合わせた。
// シナリオアウトラインでないシナリオは、EXAMPLES と for を消し、テストを 1 本にする。
// <シナリオの識別子>
import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STATE } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'

/** シナリオアウトラインの例の表の行。value は実施の結果を記録する場所の「<列>=<値>」の値を写す */
const EXAMPLES: { value: string; expected: string }[] = [
  { value: '<例の値>', expected: '<例の表の、結果の列の文>' },
]

test.describe('<機能>', () => {
  test.describe('<アクター>', () => {
    // ログインは setup の project が保存した状態を読む。setup に無い職員は setup の ACCOUNTS に足す
    test.use({ storageState: LOGIN_STATE })

    for (const [i, c] of EXAMPLES.entries()) {
      // テストの名前は「<name> <今のテストの名前>」。name は s<番号>-<話題> の英小文字で、要求ごとの README の表と同じにする
      // 改修前と比べる要求では、名前の次に { tag: '@compare' } を渡し、改修前のアプリでも撮る
      test(`s<番号>-<話題> <条件>の場合、<期待>であること ${i + 1}_${c.value}`, async ({
        browser,
        context,
      }) => {
        // 前提のデータは録画の外で作る。録画する page は、前準備の後に開く
        const prepared = await prepareOutsideRecording(
          browser,
          { storageState: LOGIN_STATE },
          async (page) => {
            // <前提のデータを作り、要る値を返す>
            void page
          },
        )
        void prepared

        const page = await context.newPage()
        // URL は baseURL からの相対パスにする
        await page.goto('<前提の画面のパス>')
        await expect(page.getByTestId('<前提の画面の要素>')).toBeVisible()
        // 操作を持たない前提の文は、step にも check にもせず、intro の 2 行目に書く
        await intro(page, '<この録画で確認すること>\n前提 <前提の文>')
        await step(page, 'もし <操作の文>', async () => {
          // <例の行の操作>
        })
        // 判定する要素が上端にあり字幕に隠れるときは、{ position: 'bottom' } を渡す
        await check(page, `ならば ${c.expected}`, () =>
          expect(page.getByTestId('<結果の要素>')).toBeVisible(),
        )
        // シナリオに無い操作は、「(撮影のため、…)」の step の中で行う
      })
    }
  })
})
