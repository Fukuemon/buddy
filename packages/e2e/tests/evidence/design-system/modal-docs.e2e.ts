import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, STORYBOOK_URL } from '../../fixtures/evidence'
import { docsCodeToggle, docsOpenDialogs, docsStoryFrames } from '../../selectors/storybookDocs'

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
          title: 'モーダルの Docs のページで、story が iframe に描かれ、ページのボタンを押せる',
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
            await expect(docsOpenDialogs(page)).toHaveCount(0)
            await check(`${label} の story が、iframe の中に ${frameCount} 個描かれる`)

            await step('最初の story の「Show code」を押す')
            const codeToggle = docsCodeToggle(page)
            await codeToggle.scrollIntoViewIfNeeded()
            await codeToggle.click()
            await expect(codeToggle).toHaveText('Hide code')
            await check('ページのほかの部分のボタンを、ダイアログに遮られずに押せる')
          }
        },
      )
    })
  }
})
