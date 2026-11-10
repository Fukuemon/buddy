import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

/** 予定のカレンダーで始める、たたんだレール */
const RAIL_STORY = '画面-common-sitenav--rail'

/** 開いた形のナビゲーション */
const OPEN_STORY = '画面-common-sitenav--manager'

/**
 * #526 で、レールでは短い名前を出し、読み上げる名前に正式な名前を続けた。改修前と比べて撮るので、確認する関数は改修前の名前も受け付ける。
 * Chrome は、読み上げにだけ置く sr-only の前に空白を入れて名前を作る
 */
const RAIL_NAME = /^(所属 ?（部署とチーム）|部署とチーム)$/

/** 改修前のレールで、幅に収まらなかった項目の名前 */
const BEFORE_OVERFLOWING = '部署とチーム'

/**
 * レールの項目ごとに、見える名前とレールの左右の端との間の狭い方の幅（px）を返す。負なら、名前がレールからはみ出している。
 * 見える名前は、項目の中の、読み上げにだけ置く `sr-only` を除いた最初の span である。
 */
const railLabelMargins = (nav: Locator) =>
  nav.evaluate((element) => {
    const navBox = element.getBoundingClientRect()
    return [...element.querySelectorAll('a')].map((link) => {
      const label = link.querySelector('span:not(.sr-only)')
      const box = (label ?? link).getBoundingClientRect()
      return {
        label: label?.textContent ?? '',
        margin: Math.floor(Math.min(box.left - navBox.left, navBox.right - box.right)),
      }
    })
  })

/**
 * 録画で読めるように、Storybook の画面を 2 倍に拡大し、ナビゲーションの外形を破線で示し、見せる項目を画面の中ほどに送る。
 * 拡大すると大きさが変わるので、測った後に呼ぶ。
 */
const enlargeForRecording = async (page: Page, item: Locator) => {
  await page.getByTestId('site-nav').evaluate((element) => {
    element.style.outline = '1px dashed red'
  })
  await page.evaluate(() => {
    document.body.style.zoom = '2'
  })
  await item.evaluate((element) => {
    element.scrollIntoView({ block: 'center' })
  })
}

const ENLARGE_RAIL =
  '（撮影のため、表示を 2 倍に拡大し、レールの幅 80px の外形を赤い破線で示し、「部署とチーム」の項目まで送る）'

// レールの名前は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版で通るものにする
test.describe('画面の間のナビゲーション', () => {
  test.describe('レールの名前（ログインなし、Storybook の story）', () => {
    test(
      'site-nav-rail-fit 幅 768px 以上でレールを表示した場合、全ての項目の名前がレールの幅 80px の中に収まること',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto(storyUrl(RAIL_STORY))
        const nav = page.getByTestId('site-nav')
        const organization = page.getByTestId('site-nav-organization')
        await expect(organization).toBeVisible()
        await intro(
          page,
          'たたんだレールで、全ての項目の名前がレールの幅の中に収まるかを見る\n前提 職員の管理の権限を持つ職員のレール（Storybook の SiteNav の Rail）を開いている',
        )

        // 拡大すると幅が変わるので、拡大する前に測る
        const navWidth = (await nav.boundingBox())?.width
        const margins = await railLabelMargins(nav)
        const narrowest = Math.min(
          ...margins.filter(({ margin }) => margin >= 1).map(({ margin }) => margin),
        )
        await step(page, ENLARGE_RAIL, () => enlargeForRecording(page, organization))
        await check(
          page,
          `全ての名前が、左右に ${narrowest}px 以上の余白を残してレールの幅に収まる`,
          async () => {
            expect(navWidth).toBe(80)
            const overflowing = margins.filter(({ margin }) => margin < 1)
            // 改修前は「部署とチーム」だけがはみ出す。改修前でも通るよう、ほかの名前が収まることを確認する
            expect(
              overflowing
                .filter(({ label }) => label !== BEFORE_OVERFLOWING)
                .map(({ label }) => label),
            ).toEqual([])
          },
        )
      },
    )

    test('site-nav-open-label レールを開いた形に切り替えた場合、項目の名前が正式な名前で出ること', async ({
      page,
    }) => {
      await page.goto(storyUrl(OPEN_STORY))
      const organization = page.getByTestId('site-nav-organization')
      await expect(organization).toBeVisible()
      await intro(
        page,
        '開いた形のナビゲーションで、部署とチームの項目の名前を見る\n前提 職員の管理の権限を持つ職員の開いた形のナビゲーション（Storybook の SiteNav の Manager）を開いている',
      )

      await step(
        page,
        '（撮影のため、表示を 2 倍に拡大し、ナビゲーションの外形を赤い破線で示し、「部署とチーム」の項目まで送る）',
        () => enlargeForRecording(page, organization),
      )
      await check(
        page,
        '「職員」の見出しの下の項目の名前は、正式な名前の「部署とチーム」で出る',
        async () => {
          await expect(organization).toHaveText('部署とチーム')
          await expect(organization).toHaveAccessibleName('部署とチーム')
        },
      )
    })

    test(
      'site-nav-rail-name スクリーンリーダーでレールの項目を読んだ場合、正式な名前の「部署とチーム」を読むこと',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto(storyUrl(RAIL_STORY))
        const organization = page.getByTestId('site-nav-organization')
        await expect(organization).toBeVisible()
        await intro(
          page,
          'たたんだレールで、部署とチームの項目の読み上げる名前を見る\n前提 職員の管理の権限を持つ職員のレール（Storybook の SiteNav の Rail）を開いている',
        )

        const name = /"(.+)"/.exec(await organization.ariaSnapshot())?.[1]
        await step(page, ENLARGE_RAIL, async () => {
          await enlargeForRecording(page, organization)
          await organization.focus()
        })
        await check(
          page,
          `アクセシビリティツリーのリンクの名前は「${name}」で、正式な名前の「部署とチーム」を読む`,
          () => expect(organization).toHaveAccessibleName(RAIL_NAME),
        )
      },
    )
  })
})
