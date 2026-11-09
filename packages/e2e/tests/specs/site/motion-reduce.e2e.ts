import { expect, test, type Page } from '@playwright/test'

import { pageRoot } from '../../selectors/page'

/**
 * 動きを減らす設定のときの画面の動きを、DESIGN.md の原則 MOTION-REDUCE で確認する。
 * 照合の画面で予定の取り方を切り替え、その後に動いている遷移とアニメーションを `document.getAnimations()` で読む。
 * 読み込み中の回転は、出る間が短く操作で出し続けられないので、`animate-spin` のクラスの要素を画面に足して、回転が動くかを見る。
 */

/** 動いている遷移とアニメーション。遷移は `transition:<プロパティ>`、アニメーションは `animation:<名前>` にする。 */
const runningMotions = (page: Page) =>
  pageRoot(page).evaluate(() =>
    document.getAnimations().map((animation) => {
      if (animation instanceof CSSTransition) return `transition:${animation.transitionProperty}`
      if (animation instanceof CSSAnimation) return `animation:${animation.animationName}`
      return 'other'
    }),
  )

/** 遷移の対象が透明度だけでない要素の数。 */
const elementsWithNonOpacityTransition = (page: Page) =>
  pageRoot(page).evaluate(
    () =>
      [...document.querySelectorAll('*')].filter(
        (element) => getComputedStyle(element).transitionProperty !== 'opacity',
      ).length,
  )

/** 予定の取り方の「予定の CSV」の選択肢を包む label の、遷移の対象。 */
const csvSourceTransitionProperty = (page: Page) =>
  page
    .getByTestId('receipt-source-csv')
    .evaluate((input) => getComputedStyle(input.closest('label') ?? input).transitionProperty)

const openReceipt = async (page: Page) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
}

test.describe('画面の枠', () => {
  test.describe('動きを減らす設定', () => {
    test('動きを減らす設定で照合の画面を開き、予定の取り方を切り替えた場合、透明度のほかの遷移が動かないこと', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openReceipt(page)

      await page.getByTestId('receipt-source-csv').click()
      await expect(page.getByTestId('receipt-schedules-file')).toBeVisible()

      expect(await elementsWithNonOpacityTransition(page)).toBe(0)
      expect(
        (await runningMotions(page)).filter((motion) => motion !== 'transition:opacity'),
      ).toEqual([])
    })

    test('動きを減らす設定が無い場合、予定の取り方の選択肢が色を遷移で変えること', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await openReceipt(page)

      expect(await csvSourceTransitionProperty(page)).toContain('color')
    })

    test('動きを減らす設定で、読み込み中の回転を出した場合、回転が動き続けること', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openReceipt(page)

      // animate-spin は packages/ui の読み込みの表示が使うので、画面の CSS にクラスがある
      await pageRoot(page).evaluate(() => {
        const spinner = document.createElement('div')
        spinner.className = 'animate-spin'
        document.body.append(spinner)
      })

      expect(await runningMotions(page)).toContain('animation:spin')
    })
  })
})
