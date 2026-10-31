import { expect, test, type Locator } from '@playwright/test'

import { EVIDENCE_VARIANTS, mockUrl, recordPrEvidence } from '../../fixtures/evidence'
import { scheduleModalTitle } from '../../selectors/calendarMocks'

const NEW = 'schedule-new_予定の作成/mocks/01-visit.html'
const EDIT = 'schedule-edit_予定の編集/mocks/03-initial.html'
const DETAIL = 'schedule-detail_予定の詳細/mocks/01-visit.html'

/** 閉じるボタン（×）が、タイトルより右にあるか */
const expectCloseRightOfTitle = async (title: Locator, close: Locator) => {
  const titleBox = await title.boundingBox()
  const closeBox = await close.boundingBox()
  expect(titleBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  expect(closeBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width)
}

test.describe('予定のダイアログの画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}予定の作成のモックを開いた場合、× が右上にあり、フッターのキャンセルで予定のカレンダーへ戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-new-mock-header-footer',
          title:
            '予定の作成は、タイトルを左、× を右上に置き、フッターの右に「キャンセル」と「作成」を置く',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(NEW))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(NEW))
          const modal = page.getByTestId('schedule-form-modal')
          await expectCloseRightOfTitle(
            scheduleModalTitle(modal, '予定の作成'),
            page.getByTestId('modal-close'),
          )
          await expect(page.getByTestId('schedule-new-cancel')).toHaveText('キャンセル')
          await expect(page.getByTestId('schedule-create-submit')).toHaveText('作成')
          await check(
            'タイトル「予定の作成」が左、× が右上にあり、フッターの右に「キャンセル」と「作成」が並ぶ',
          )

          await step('「キャンセル」を押す')
          await page.getByTestId('schedule-new-cancel').click()
          await expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/)
          await check('何も作らずに、予定のカレンダーのモック（01-month.html）へ戻る')
        },
      )
    })

    test(`${prefix}予定の編集のモックを開いた場合、× が右上にあり、フッターのキャンセルで予定の詳細へ戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-edit-mock-header-footer',
          title:
            '予定の編集は、タイトルを左、× を右上に置き、フッターの右に「キャンセル」と「保存」を置く',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(EDIT))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(EDIT))
          const modal = page.getByTestId('schedule-form-modal')
          await expectCloseRightOfTitle(
            scheduleModalTitle(modal, '予定の編集'),
            page.getByTestId('modal-close'),
          )
          await expect(page.getByTestId('schedule-edit-cancel')).toHaveText('キャンセル')
          await expect(page.getByTestId('schedule-edit-submit')).toHaveText('保存')
          await check(
            'タイトル「予定の編集」が左、× が右上にあり、フッターの右に「キャンセル」と「保存」が並ぶ',
          )

          await step('「キャンセル」を押す')
          await page.getByTestId('schedule-edit-cancel').click()
          await expect(page).toHaveURL(/schedule-detail_.+\/01-visit\.html/)
          await check('何も変えずに、予定の詳細のモック（01-visit.html）へ戻る')
        },
      )
    })

    test(`${prefix}予定の詳細のモックを開いた場合、× が右上にあり、フッターの閉じるで予定のカレンダーへ戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-detail-mock-header-footer',
          title:
            '予定の詳細は、タイトルを左、× を右上に置き、フッターの右に「閉じる」と「編集」を置く',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(DETAIL))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(DETAIL))
          const modal = page.getByTestId('schedule-detail-modal')
          await expectCloseRightOfTitle(
            scheduleModalTitle(modal, '予定の詳細'),
            page.getByTestId('modal-close'),
          )
          await expect(page.getByTestId('schedule-detail-close')).toHaveText('閉じる')
          await expect(page.getByTestId('schedule-detail-edit')).toHaveText('編集')
          await check(
            'タイトル「予定の詳細」が左、× が右上にあり、フッターの右に「閉じる」と「編集」が並ぶ',
          )

          await step('フッターの「閉じる」を押す')
          await page.getByTestId('schedule-detail-close').click()
          await expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/)
          await check('予定のカレンダーのモック（01-month.html）へ戻る')
        },
      )
    })
  }
})
