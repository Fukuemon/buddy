import { expect, test, type Locator, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

/** 予定のカレンダーで始める、たたんだレール */
const RAIL_STORY = '画面-common-sitenav--rail'

/** 開いた形のナビゲーション */
const OPEN_STORY = '画面-common-sitenav--manager'

/** #526 で、レールでは短い名前を出し、読み上げる名前に正式な名前を続けた。改修前と比べて撮るので、両方の名前を持つ */
const EXPECTED = {
  before: { railName: /^部署とチーム$/ },
  // Chrome は、読み上げにだけ置く sr-only の前に空白を入れて名前を作る
  after: { railName: /^所属 ?（部署とチーム）$/ },
}

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

test.describe('画面の間のナビゲーション', () => {
  test.describe('レールの名前', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'
      const expected = isBefore ? EXPECTED.before : EXPECTED.after

      test(`${prefix}幅 768px 以上でレールを表示した場合、全ての項目の名前がレールの幅 80px の中に収まること`, async ({
        browser,
      }) => {
        const url = storyUrl(RAIL_STORY)
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-rail-fit',
            title: 'たたんだレールで、全ての項目の名前がレールの幅の中に収まるかを見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            const nav = page.getByTestId('site-nav')
            await expect(page.getByTestId('site-nav-organization')).toBeVisible()
            await step(
              '職員の管理の権限を持つ職員のレール（Storybook の SiteNav の Rail）を開いている',
            )
            const margins = await railLabelMargins(nav)
            expect((await nav.boundingBox())?.width).toBe(80)
            const overflowing = margins.filter(({ margin }) => margin < 1)
            if (isBefore) expect(overflowing.map(({ label }) => label)).toEqual(['部署とチーム'])
            else expect(overflowing).toEqual([])
            await step(
              '(撮影のため、表示を 2 倍に拡大し、レールの幅 80px の外形を赤い破線で示し、「部署とチーム」の項目まで送る)',
            )
            await enlargeForRecording(page, page.getByTestId('site-nav-organization'))
            const narrowest = Math.min(
              ...margins.filter(({ margin }) => margin >= 1).map(({ margin }) => margin),
            )
            const organizationMargin = margins.find(({ label }) => label.includes('部署'))?.margin
            await check(
              isBefore
                ? `「部署とチーム」は、レールの端から ${-(organizationMargin ?? 0)}px はみ出す。ほかの名前は、左右に ${narrowest}px 以上の余白を残して収まる`
                : `全ての名前が、左右に ${narrowest}px 以上の余白を残してレールの幅に収まる`,
            )
          },
        )
      })

      test(`${prefix}レールを開いた形に切り替えた場合、項目の名前が正式な名前で出ること`, async ({
        browser,
      }) => {
        const url = storyUrl(OPEN_STORY)
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-open-label',
            title: '開いた形のナビゲーションで、部署とチームの項目の名前を見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            const organization = page.getByTestId('site-nav-organization')
            await expect(organization).toBeVisible()
            await step(
              '職員の管理の権限を持つ職員の開いた形のナビゲーション（Storybook の SiteNav の Manager）を開いている',
            )
            await expect(organization).toHaveText('部署とチーム')
            await expect(organization).toHaveAccessibleName('部署とチーム')
            await step(
              '(撮影のため、表示を 2 倍に拡大し、ナビゲーションの外形を赤い破線で示し、「部署とチーム」の項目まで送る)',
            )
            await enlargeForRecording(page, organization)
            await check('「職員」の見出しの下の項目の名前は、正式な名前の「部署とチーム」で出る')
          },
        )
      })

      test(`${prefix}スクリーンリーダーでレールの項目を読んだ場合、正式な名前の「部署とチーム」を読むこと`, async ({
        browser,
      }) => {
        const url = storyUrl(RAIL_STORY)
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-rail-name',
            title: 'たたんだレールで、部署とチームの項目の読み上げる名前を見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            const organization = page.getByTestId('site-nav-organization')
            await expect(organization).toBeVisible()
            await step(
              '職員の管理の権限を持つ職員のレール（Storybook の SiteNav の Rail）を開いている',
            )
            await expect(organization).toHaveAccessibleName(expected.railName)
            const name = /"(.+)"/.exec(await organization.ariaSnapshot())?.[1]
            await step(
              '(撮影のため、表示を 2 倍に拡大し、レールの幅 80px の外形を赤い破線で示し、「部署とチーム」の項目まで送る)',
            )
            await enlargeForRecording(page, organization)
            await organization.focus()
            await check(
              `アクセシビリティツリーのリンクの名前は「${name}」で、正式な名前の「部署とチーム」を読む`,
            )
          },
        )
      })
    }
  })
})
