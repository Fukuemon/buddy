import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { screenTemplate } from '../../selectors/screenTemplate'

const LIST = '_template/mocks/01-initial.html'
const CONFIRM = '_template/mocks/03-confirm.html'

test.describe('画面仕様書のテンプレートのモック', () => {
  test.describe('パソコンの幅（ログインなし、画面仕様書のモック）', () => {
    test('template-list-desktop パソコンの幅で一覧のモックを開いた場合、行全体を押せる表と、上に検索、絞り込み、件数が出ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(LIST))
      const t = screenTemplate(page)
      await expect(t.table).toBeVisible()
      await intro(
        page,
        'パソコンの幅の一覧は、行全体を押せる表で、行の右端に「›」があり、名前の列は折り返さない\n前提 一覧のモック（01-initial.html）を開いている',
      )

      await check(page, '一覧の上に、名前の検索、絞り込み、件数が並ぶ', async () => {
        await expect(t.search).toBeVisible()
        await expect(t.count).toHaveText('4 件')
      })

      await step(page, '1 つ目の行に乗せる', () => t.firstName.hover())
      await check(
        page,
        '行全体が押せる形になり、行の右端に「›」がある。名前の列は折り返さない',
        async () => {
          await expect(t.firstRow).toHaveCSS('cursor', 'pointer')
          await expect(t.firstGo).toHaveText('›')
          await expect(t.firstName).toHaveCSS('white-space', 'nowrap')
        },
      )
    })

    test('template-form-dialog 一覧のモックで登録を押した場合、× が無く、フッターの右にキャンセルと主ボタンがある入力のダイアログが出て、Escape で一覧に戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(LIST))
      const t = screenTemplate(page)
      await expect(t.create).toBeVisible()
      await intro(
        page,
        '入力のダイアログは × を置かず、フッターの右に「キャンセル」と主ボタンを置き、Escape で閉じる\n前提 一覧のモック（01-initial.html）を開いている',
      )

      await step(page, '「登録」を押す', () => t.create.click())
      await check(
        page,
        '入力のダイアログのモック（02-form.html）へ移り、× が無く、フッターの右に「キャンセル」と主ボタンがある',
        async () => {
          await expect(page).toHaveURL(/_template\/mocks\/02-form\.html/)
          await expect(t.formDialog).toBeVisible()
          await expect(t.formClose).toHaveCount(0)
          await expect(t.formCancel).toHaveText('キャンセル')
          await expect(t.formSubmit).toHaveClass(/wf-btn--primary/)
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, '一覧のモック（01-initial.html）へ戻る', async () => {
        await expect(page).toHaveURL(/_template\/mocks\/01-initial\.html/)
        await expect(t.table).toBeVisible()
      })
    })

    test('template-confirm-dialog 確認のダイアログのモックを開いた場合、× が無く、フッターの右にキャンセルと赤の確定のボタンがあり、Escape で一覧に戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(CONFIRM))
      const t = screenTemplate(page)
      await expect(t.confirmDialog).toBeVisible()
      await intro(
        page,
        '確認のダイアログは × を置かず、フッターの右に「キャンセル」と赤の確定のボタンを置き、Escape で閉じる\n前提 確認のダイアログのモック（03-confirm.html）を開いている',
      )

      await check(
        page,
        '確認のダイアログのモック（03-confirm.html）に × が無く、フッターの右に「キャンセル」と赤の確定のボタンがある',
        async () => {
          await expect(t.confirmClose).toHaveCount(0)
          await expect(t.confirmCancel).toHaveText('キャンセル')
          await expect(t.confirmSubmit).toHaveClass(/wf-btn--danger/)
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, '一覧のモック（01-initial.html）へ戻る', async () => {
        await expect(page).toHaveURL(/_template\/mocks\/01-initial\.html/)
        await expect(t.table).toBeVisible()
      })
    })

    test('template-more-help 一覧のモックで詳しくと ? のヘルプを押した場合、説明が開き、もう一度押すか Escape で閉じること', async ({
      page,
    }) => {
      await page.goto(mockUrl(LIST))
      const t = screenTemplate(page)
      await expect(t.more).toBeVisible()
      await expect(t.moreText).toBeHidden()
      await intro(
        page,
        '「詳しく」を押すと続きの説明が開いてもう一度押すと閉じ、? のヘルプを押すと説明が出て Escape で閉じる\n前提 一覧のモック（01-initial.html）を開いている。続きの説明は閉じている',
      )

      await step(page, '「詳しく」を押す', () => t.more.click())
      await check(page, '続きの説明が開く', async () => {
        await expect(t.moreText).toBeVisible()
        await expect(t.more).toHaveAttribute('aria-expanded', 'true')
      })

      await step(page, 'もう一度「詳しく」を押す', () => t.more.click())
      await check(page, '続きの説明が閉じる', () => expect(t.moreText).toBeHidden())

      await step(page, '見出しの右の ? を押す', () => t.help.click())
      await check(
        page,
        '見出しの下に、ヘルプの説明が出る',
        () => expect(t.helpText).toBeVisible(),
        {
          position: 'bottom',
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, 'ヘルプの説明が閉じる', () => expect(t.helpText).toBeHidden())
    })
  })

  test.describe('スマートフォンの幅（ログインなし、画面仕様書のモック）', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('template-list-phone スマートフォンの幅で一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto(mockUrl(LIST))
      const t = screenTemplate(page)
      await expect(t.firstRow).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅の一覧は、1 行目に名前と状態の印、2 行目に補足の値を「・」でつないだリストになる\n前提 スマートフォンの幅（390x844）で、一覧のモック（01-initial.html）を開いている',
      )

      await check(
        page,
        '行が 2 行のリストになり、1 行目に名前と状態の印、2 行目に補足の値が「・」でつながる。横にスクロールしない',
        async () => {
          await expect(t.firstRow).toHaveCSS('display', 'flex')
          await expect(t.firstGo).toHaveCSS('position', 'absolute')
          await expect(t.root).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })
  })
})
