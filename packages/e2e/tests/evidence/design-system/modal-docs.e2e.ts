import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { STORYBOOK_URL } from '../../fixtures/evidence'
import { docsCodeToggle, docsOpenDialogs, docsStoryFrames } from '../../selectors/storybookDocs'

/** `<dialog>` の showModal で開くコンポーネントのうち、Docs のページを撮るもの。 */
const MODAL_DOCS = [
  { id: 'コンポーネント-base-modal--docs', label: 'Modal' },
  { id: 'パターン-inputdialog--docs', label: 'InputDialog' },
]

const docsUrl = (id: string) =>
  `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(id)}&viewMode=docs`

const openDocs = async (page: Page, id: string) => {
  await page.goto(docsUrl(id))
  await expect(docsStoryFrames(page).first()).toBeVisible()
}

test.describe('モーダルの Docs のページ', () => {
  test.describe('story の描き方（ログインなし、Storybook の Docs のページ）', () => {
    test('modal-docs-iframe Storybook の Docs のページでモーダルのコンポーネントを開いた場合、各 story が iframe の中に描かれ、ページを操作できること', async ({
      page,
    }) => {
      const [first, ...rest] = MODAL_DOCS
      await openDocs(page, first.id)
      await intro(
        page,
        `モーダルの Docs のページで、story が iframe に描かれ、ページのボタンを押せる\n前提 ${first.label} の Docs のページを開いている`,
      )

      for (const { id, label } of MODAL_DOCS) {
        if (rest.some((docs) => docs.id === id))
          await step(page, `${label} の Docs のページを開く`, () => openDocs(page, id))
        const storyFrames = docsStoryFrames(page)
        const frameCount = await storyFrames.count()
        await check(
          page,
          `${label} の story が、iframe の中に ${frameCount} 個描かれる`,
          async () => {
            await expect(storyFrames.first()).toBeVisible()
            await expect(docsOpenDialogs(page)).toHaveCount(0)
          },
        )

        const codeToggle = docsCodeToggle(page)
        await step(page, '最初の story の「Show code」を押す', async () => {
          await codeToggle.scrollIntoViewIfNeeded()
          await codeToggle.click()
        })
        await check(page, 'ページのほかの部分のボタンを、ダイアログに遮られずに押せる', () =>
          expect(codeToggle).toHaveText('Hide code'),
        )
      }
    })
  })
})
