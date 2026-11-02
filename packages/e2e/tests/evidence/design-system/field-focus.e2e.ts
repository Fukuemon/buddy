import { expect, test, type Locator, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { fieldByLabel, fieldLabel, fieldNote } from '../../selectors/formField'
import { pageBody } from '../../selectors/page'

const ACTOR = 'ログインなし（Storybook の story）'

const FORM_FIELD_URL = storyUrl('コンポーネント-base-formfield--with-hint-and-error')
const RECEIPT_FORM_URL = storyUrl('画面-receipt-receiptcheckform--calendar')
const STAFF_LIST_URL = storyUrl('画面-staff-stafflistcontainer--default')

/** 欄の 1 つ前に戻り、Tab キーで欄に移る。focus() だけでは select と file の欄が :focus-visible にならない。 */
const focusByTab = async (page: Page, field: Locator) => {
  await field.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(field).toBeFocused()
}

/** 字幕の帯に隠れないように story の中身を下へずらし、zoom の倍率で拡大する。撮影のための操作なので、前に字幕で断る。 */
const shiftStory = async (page: Page, zoom = 1) => {
  await page.addStyleTag({
    content: `#storybook-root { padding-top: ${Math.round(72 / zoom)}px; zoom: ${zoom}; }`,
  })
}

/** 上の要素の下端から、下の要素の上端までの px。 */
const spaceBetween = async (upper: Locator, lower: Locator): Promise<number> => {
  const a = await upper.boundingBox()
  const b = await lower.boundingBox()
  if (a === null || b === null) throw new Error('要素の位置が取れない')
  return Math.round(b.y - (a.y + a.height))
}

test.describe('入力の欄', () => {
  test.describe('フォーカスの表示と近くの文字の間', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}FormField の欄にフォーカスした場合、フォーカスの表示とラベルの文字の間に余白があり、重ならないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'form-field-focus-label',
            title: 'FormField の欄にキーボードでフォーカスし、フォーカスの表示とラベルの間を見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(FORM_FIELD_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(FORM_FIELD_URL)
            const input = fieldByLabel(pageBody(page), 'メールアドレス')
            await expect(input).toBeVisible()
            await step(
              'FormField の補足の文と誤りの文がある欄（Storybook の FormField の WithHintAndError）を開いている',
            )
            // 拡大すると位置の値も拡大されるので、拡大の前に測る
            const space = await spaceBetween(fieldLabel(pageBody(page), 'メールアドレス'), input)
            await step('(撮影のため、字幕に隠れないように下へずらし、2 倍に拡大する)')
            await shiftStory(page, 2)

            await step('欄の 1 つ前に戻り、Tab キーで「メールアドレス」の欄に移る')
            await focusByTab(page, input)
            await check(
              `フォーカスの表示と「メールアドレス」の文字の間に余白があり、重ならない（撮影のため、見出しと欄の間の ${space}px を出す。フォーカスの表示は欄の外へ 6px 広がる）`,
            )
          },
        )
      })

      test(`${prefix}補足の文と誤りの文がある欄にフォーカスした場合、フォーカスの表示が補足の文と誤りの文に重ならないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'form-field-focus-hint-error',
            title:
              'FormField の補足の文と誤りの文がある欄にキーボードでフォーカスし、フォーカスの表示と下の文の間を見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(FORM_FIELD_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(FORM_FIELD_URL)
            const input = fieldByLabel(pageBody(page), 'メールアドレス')
            await expect(
              fieldNote(pageBody(page), 'メールアドレスの形で入れてください'),
            ).toBeVisible()
            await step(
              'FormField の補足の文と誤りの文がある欄（Storybook の FormField の WithHintAndError）を開いている',
            )
            // 拡大すると位置の値も拡大されるので、拡大の前に測る
            const hint = fieldNote(pageBody(page), 'ログインに使うメールアドレスです。')
            const space = await spaceBetween(input, hint)
            await step('(撮影のため、字幕に隠れないように下へずらし、2 倍に拡大する)')
            await shiftStory(page, 2)

            await step('欄の 1 つ前に戻り、Tab キーで「メールアドレス」の欄に移る')
            await focusByTab(page, input)
            await check(
              `フォーカスの表示が、下の補足の文「ログインに使うメールアドレスです。」と誤りの文に重ならない（撮影のため、欄と補足の文の間の ${space}px を出す）`,
            )
          },
        )
      })

      test(`${prefix}FormField を使わない入力の欄にフォーカスした場合、フォーカスの表示が近くの文字に重ならないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'field-focus-without-form-field',
            title:
              '照合の月の欄、CSV のファイルの欄、職員の一覧の絞り込みにキーボードでフォーカスし、フォーカスの表示と近くの文字の間を見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(RECEIPT_FORM_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(RECEIPT_FORM_URL)
            const month = page.getByTestId('receipt-month')
            await expect(month).toBeVisible()
            await step('照合の条件の欄（Storybook の ReceiptCheckForm の Calendar）を開いている')
            await step('(撮影のため、字幕に隠れないように下へずらす)')
            await shiftStory(page)

            await step('Tab キーで「対象の月」の欄に移る')
            await focusByTab(page, month)
            const monthSpace = await spaceBetween(fieldLabel(pageBody(page), '対象の月'), month)
            await check(
              `フォーカスの表示が、上の「対象の月」と下の補足の文に重ならない（撮影のため、見出しと欄の間の ${monthSpace}px を出す）`,
            )

            await step('Tab キーで「実績の CSV」のファイルの欄に移る')
            const file = page.getByTestId('receipt-visits-file')
            await focusByTab(page, file)
            const fileSpace = await spaceBetween(fieldLabel(pageBody(page), '実績の CSV'), file)
            await check(
              `フォーカスの表示が、上の「実績の CSV」と下の補足の文に重ならない（撮影のため、見出しと欄の間の ${fileSpace}px を出す）`,
            )

            await step('職員の一覧（Storybook の StaffListContainer の Default）を開く')
            await page.goto(STAFF_LIST_URL)
            const team = page.getByTestId('staff-list-filter-team')
            await expect(team).toBeEnabled()
            await step('(撮影のため、字幕に隠れないように下へずらす)')
            await shiftStory(page)

            await step('Tab キーで「チーム」の絞り込みに移る')
            await focusByTab(page, team)
            await check('フォーカスの表示が、隣の絞り込みと件数の文字に重ならない')
          },
        )
      })
    }
  })
})
