import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { fieldByLabel } from '../../selectors/formField'
import { pageBody } from '../../selectors/page'

const RECEIPT_CALENDAR_URL = storyUrl('画面-receipt-receiptcheckform--calendar')
const RECEIPT_CSV_URL = storyUrl('画面-receipt-receiptcheckform--schedule-csv')
const MONTH_DISABLED_URL = storyUrl('コンポーネント-base-monthpicker--disabled')
const FORM_FIELD_INVALID_URL = storyUrl('コンポーネント-base-formfield--invalid')

const SHIFT_STORY = '(撮影のため、字幕に隠れないように下へずらし、2 倍に拡大する)'

/** 字幕の帯に隠れないように story の中身を下へずらし、zoom の倍率で拡大する。撮影のための操作なので、前に字幕で断る。 */
const shiftStory = async (page: Page, zoom = 1) => {
  await page.addStyleTag({
    content: `#storybook-root { padding-top: ${Math.round(72 / zoom)}px; zoom: ${zoom}; }`,
  })
}

/** 欄の 1 つ前に戻り、Tab キーで欄に移る。focus() だけでは file の欄が :focus-visible にならない。 */
const focusByTab = async (page: Page, field: Locator) => {
  await field.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
}

/** 欄の上の枠の色と太さ。枠の色は 100ms で移るものがあるので、expect.poll で移り終えるのを待って比べる。 */
const borderOf = (field: Locator) =>
  field.evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.borderTopColor, width: style.borderTopWidth }
  })

/** 意味の色のトークン（`--buddy-color-*`）を、ブラウザが計算した rgb の文字列にする。 */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

test.describe('入力の欄', () => {
  test.describe('入力の欄の状態（ログインなし、Storybook の story）', () => {
    test('field-hover 入力の欄にマウスを乗せた場合、枠が黒に変わり、外すと戻ること', async ({
      page,
    }) => {
      await page.goto(RECEIPT_CALENDAR_URL)
      const month = page.getByTestId('receipt-month')
      await expect(month).toBeVisible()
      await intro(
        page,
        '照合の月の欄にマウスを乗せ、外し、枠の色を見る\n前提 照合の条件の欄（Storybook の ReceiptCheckForm の Calendar）を開いている',
      )
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      const field = await tokenColor(page, '--buddy-color-border-field')
      const hover = await tokenColor(page, '--buddy-color-border-field-hover')
      await expect.poll(() => borderOf(month)).toEqual({ color: field, width: '1px' })

      await step(page, '「対象の月」の欄にマウスを乗せる', () => month.hover())
      await check(
        page,
        `枠が border-field（${field}）から黒の border-field-hover（${hover}）に変わる`,
        () => expect.poll(() => borderOf(month)).toEqual({ color: hover, width: '1px' }),
      )

      await step(page, 'マウスを欄の外へ外す', () => page.mouse.move(0, 0))
      await check(page, `枠が border-field（${field}）に戻る`, () =>
        expect.poll(() => borderOf(month)).toEqual({ color: field, width: '1px' }),
      )
    })

    test('field-disabled-hover 無効の欄にマウスを乗せた場合、枠の色が変わらないこと', async ({
      page,
    }) => {
      await page.goto(MONTH_DISABLED_URL)
      const month = fieldByLabel(pageBody(page), '対象の月')
      await expect(month).toBeDisabled()
      await intro(
        page,
        '無効の月の欄にマウスを乗せ、枠の色を見る\n前提 無効の月の欄（Storybook の MonthPicker の Disabled）を開いている',
      )
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      const before = await borderOf(month)

      await step(page, '「対象の月」の欄にマウスを乗せる', () => month.hover())
      await check(page, `枠は ${before.color} のまま変わらない`, () =>
        expect.poll(() => borderOf(month)).toEqual(before),
      )
    })

    test('receipt-file-field-states 照合のファイルの欄にマウスを乗せた場合、ほかの入力の欄と同じ枠と hover の表示を持つこと', async ({
      page,
    }) => {
      await page.goto(RECEIPT_CSV_URL)
      const file = page.getByTestId('receipt-visits-file')
      await expect(file).toBeVisible()
      await intro(
        page,
        '照合の CSV のファイルの欄の枠と hover の表示を、ほかの入力の欄の枠の色と比べる\n前提 予定と実績の CSV で照合する条件の欄（Storybook の ReceiptCheckForm の ScheduleCsv）を開いている',
      )
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      const field = await tokenColor(page, '--buddy-color-border-field')
      const hover = await tokenColor(page, '--buddy-color-border-field-hover')
      const radius = await file.evaluate((element) => getComputedStyle(element).borderRadius)
      await check(
        page,
        `「実績の CSV」の枠は、ほかの入力の欄と同じ 1px の border-field（${field}）で、角丸は ${radius}`,
        () => expect.poll(() => borderOf(file)).toEqual({ color: field, width: '1px' }),
      )

      await step(page, '「実績の CSV」の欄にマウスを乗せる', () => file.hover())
      await check(
        page,
        `枠が、ほかの入力の欄と同じ黒の border-field-hover（${hover}）に変わる`,
        () => expect.poll(() => borderOf(file)).toEqual({ color: hover, width: '1px' }),
      )

      await step(page, 'マウスを欄の外へ外す', () => page.mouse.move(0, 0))
      await step(page, 'Tab キーで「実績の CSV」の欄に移る', () => focusByTab(page, file))
      await check(page, 'ほかの入力の欄と同じ、黒の線と黄色の縁のフォーカスの表示を出す', () =>
        expect(file).toBeFocused(),
      )
    })

    test('field-invalid-focus 誤りのある欄にフォーカスした場合、誤りのない欄と同じ黄色の縁のフォーカスの表示を出すこと', async ({
      page,
    }) => {
      await page.goto(FORM_FIELD_INVALID_URL)
      const input = fieldByLabel(pageBody(page), '名前')
      await expect(input).toHaveAttribute('aria-invalid', 'true')
      await intro(
        page,
        '誤りのある欄にキーボードでフォーカスし、フォーカスの表示の黄色の縁を見る\n前提 誤りのある欄（Storybook の FormField の Invalid）を開いている',
      )
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      const halo = await tokenColor(page, '--buddy-color-focus-halo')

      await step(page, '欄の 1 つ前に戻り、Tab キーで「名前」の欄に移る', async () => {
        await focusByTab(page, input)
        await expect(input).toBeFocused()
      })
      await check(
        page,
        `誤りの赤い 2px の枠を残したまま、外に黒の線と黄色の縁（${halo}）のフォーカスの表示を出す`,
        async () => {
          const shadow = await input.evaluate((element) => getComputedStyle(element).boxShadow)
          expect(shadow).toContain(halo)
          await expect.poll(() => borderOf(input)).toMatchObject({ width: '2px' })
        },
      )
    })
  })
})
