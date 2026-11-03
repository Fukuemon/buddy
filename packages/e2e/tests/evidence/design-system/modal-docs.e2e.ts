import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, STORYBOOK_URL } from '../../fixtures/evidence'
import { docsOpenDialogs, docsStoryFrames } from '../../selectors/storybookDocs'

const ACTOR = 'ログインなし（Storybook の Docs のページ）'

/** `<dialog>` の showModal で開くコンポーネントのうち、Docs のページを撮るもの。 */
const MODAL_DOCS = [
  { id: 'コンポーネント-base-modal--docs', label: 'Modal' },
  { id: 'パターン-inputdialog--docs', label: 'InputDialog' },
]

const docsUrl = (id: string) =>
  `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(id)}&viewMode=docs`

test.describe('モーダルの Docs のページ', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}Storybook の Docs のページでモーダルのコンポーネントを開いた場合、各 story が iframe の中に描かれ、ページを操作できること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'modal-docs-iframe',
          title: 'モーダルの Docs のページで、story が iframe に描かれ、ページをスクロールできる',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto(docsUrl(MODAL_DOCS[0].id))
        },
        async ({ page, step, check }) => {
          for (const { id, label } of MODAL_DOCS) {
            await step(`${label} の Docs のページを開く`)
            await page.goto(docsUrl(id))
            const storyFrames = docsStoryFrames(page)
            await expect(storyFrames.first()).toBeVisible()
            const frameCount = await storyFrames.count()
            expect(frameCount).toBeGreaterThan(0)
            await expect(docsOpenDialogs(page)).toHaveCount(0)
            await check(`${label} の story が、iframe の中に ${frameCount} 個描かれる`)

            await step('ページを下へスクロールする')
            await page.mouse.wheel(0, 800)
            await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
            await check('ページのほかの部分を、ダイアログに遮られずにスクロールできる')
          }
        },
      )
    })
  }
})
