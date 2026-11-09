import { expect, test } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  mockUrl,
  recordPrEvidence,
} from '../../fixtures/evidence'
import { screenTemplate } from '../../selectors/screenTemplate'

const LIST = '_template/mocks/01-initial.html'
const CONFIRM = '_template/mocks/03-confirm.html'

test.describe('画面仕様書のテンプレートのモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}パソコンの幅で一覧のモックを開いた場合、行全体を押せる表と、上に検索、絞り込み、件数が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'template-list-desktop',
          title:
            'パソコンの幅の一覧は、行全体を押せる表で、行の右端に「›」があり、名前の列は折り返さない',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(LIST))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(LIST))
          const t = screenTemplate(page)
          await expect(t.table).toBeVisible()
          await expect(t.search).toBeVisible()
          await expect(t.count).toHaveText('4 件')
          await check('一覧の上に、名前の検索、絞り込み、件数が並ぶ')

          await step('1 つ目の行に乗せる')
          await t.firstName.hover()
          await expect(t.firstRow).toHaveCSS('cursor', 'pointer')
          await expect(t.firstGo).toHaveText('›')
          await expect(t.firstName).toHaveCSS('white-space', 'nowrap')
          await check('行全体が押せる形になり、行の右端に「›」がある。名前の列は折り返さない')
        },
      )
    })

    test(`${prefix}スマートフォンの幅で一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'template-list-phone',
          title:
            'スマートフォンの幅の一覧は、1 行目に名前と状態の印、2 行目に補足の値を「・」でつないだリストになる',
          actor: 'ログインなし',
          variant,
          viewport: PHONE_VIEWPORT,
        },
        async (page) => {
          await page.goto(mockUrl(LIST))
        },
        async ({ page, check }) => {
          await page.goto(mockUrl(LIST))
          const t = screenTemplate(page)
          await expect(t.firstRow).toBeVisible()
          await expect(t.firstRow).toHaveCSS('display', 'flex')
          await expect(t.firstGo).toHaveCSS('position', 'absolute')
          await expect(t.root).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check(
            '行が 2 行のリストになり、1 行目に名前と状態の印、2 行目に補足の値が「・」でつながる。横にスクロールしない',
          )
        },
      )
    })

    test(`${prefix}一覧のモックで登録を押した場合、× が無く、フッターの右にキャンセルと主ボタンがある入力のダイアログが出て、Escape で一覧に戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'template-form-dialog',
          title:
            '入力のダイアログは × を置かず、フッターの右に「キャンセル」と主ボタンを置き、Escape で閉じる',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(LIST))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(LIST))
          const t = screenTemplate(page)
          await expect(t.create).toBeVisible()
          await step('一覧のモック（01-initial.html）を開いている')

          await step('「登録」を押す')
          await t.create.click()
          await expect(page).toHaveURL(/_template\/mocks\/02-form\.html/)
          await expect(t.formDialog).toBeVisible()
          await expect(t.formClose).toHaveCount(0)
          await expect(t.formCancel).toHaveText('キャンセル')
          await expect(t.formSubmit).toHaveClass(/wf-btn--primary/)
          await check(
            '入力のダイアログのモック（02-form.html）へ移り、× が無く、フッターの右に「キャンセル」と主ボタンがある',
          )

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/_template\/mocks\/01-initial\.html/)
          await expect(t.table).toBeVisible()
          await check('一覧のモック（01-initial.html）へ戻る')
        },
      )
    })

    test(`${prefix}確認のダイアログのモックを開いた場合、× が無く、フッターの右にキャンセルと赤の確定のボタンがあり、Escape で一覧に戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'template-confirm-dialog',
          title:
            '確認のダイアログは × を置かず、フッターの右に「キャンセル」と赤の確定のボタンを置き、Escape で閉じる',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(CONFIRM))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(CONFIRM))
          const t = screenTemplate(page)
          await expect(t.confirmDialog).toBeVisible()
          await expect(t.confirmClose).toHaveCount(0)
          await expect(t.confirmCancel).toHaveText('キャンセル')
          await expect(t.confirmSubmit).toHaveClass(/wf-btn--danger/)
          await check(
            '確認のダイアログのモック（03-confirm.html）に × が無く、フッターの右に「キャンセル」と赤の確定のボタンがある',
          )

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/_template\/mocks\/01-initial\.html/)
          await expect(t.table).toBeVisible()
          await check('一覧のモック（01-initial.html）へ戻る')
        },
      )
    })

    test(`${prefix}一覧のモックで詳しくと ? のヘルプを押した場合、説明が開き、もう一度押すか Escape で閉じること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'template-more-help',
          title:
            '「詳しく」を押すと続きの説明が開いてもう一度押すと閉じ、? のヘルプを押すと説明が出て Escape で閉じる',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(LIST))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(LIST))
          const t = screenTemplate(page)
          await expect(t.more).toBeVisible()
          await expect(t.moreText).toBeHidden()
          await step('一覧のモック（01-initial.html）を開いている。続きの説明は閉じている')

          await step('「詳しく」を押す')
          await t.more.click()
          await expect(t.moreText).toBeVisible()
          await expect(t.more).toHaveAttribute('aria-expanded', 'true')
          await check('続きの説明が開く')

          await step('もう一度「詳しく」を押す')
          await t.more.click()
          await expect(t.moreText).toBeHidden()
          await check('続きの説明が閉じる')

          await step('見出しの右の ? を押す')
          await t.help.click()
          await expect(t.helpText).toBeVisible()
          await check('見出しの下に、ヘルプの説明が出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(t.helpText).toBeHidden()
          await check('ヘルプの説明が閉じる')
        },
      )
    })
  }
})
