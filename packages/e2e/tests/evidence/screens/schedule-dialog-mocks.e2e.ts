import { expect, test, type Locator } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'
import { scheduleModalTitle } from '../../selectors/scheduleModalMock'

const NEW = 'schedule-new_予定の作成/mocks/01-visit.html'
const EDIT = 'schedule-edit_予定の編集/mocks/03-initial.html'
const DETAIL = 'schedule-detail_予定の詳細/mocks/01-visit.html'

/**
 * right の左端が left の右端より右に来るまで待つ。フッターのボタンの順を確認する。
 * 座標が読めないうちは負の値を返し、描き終えるまで待ち続ける。
 */
const expectRightOf = async (left: Locator, right: Locator) => {
  await expect
    .poll(async () => {
      const a = await left.boundingBox()
      const b = await right.boundingBox()
      if (!a || !b) return -1
      return b.x - (a.x + a.width)
    })
    .toBeGreaterThan(0)
}

test.describe('予定のダイアログの画面仕様書のモック', () => {
  test.describe('ヘッダーとフッター（ログインなし、画面仕様書のモック）', () => {
    test('schedule-new-mock-header-footer 予定の作成のモックを開いた場合、× が無く、Escape で予定のカレンダーへ戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(NEW))
      const modal = page.getByTestId('schedule-form-modal')
      await expect(scheduleModalTitle(modal, '予定の作成')).toBeVisible()
      await intro(
        page,
        '予定の作成は、タイトルを左に置き、× を置かず、フッターの右に「キャンセル」と「作成」を置く\n前提 予定の作成の訪問の予定のモック（01-visit.html）を開いている',
      )

      await check(
        page,
        'タイトル「予定の作成」が左にあり、右上に × が無く、フッターの右に「キャンセル」と「作成」が並ぶ',
        async () => {
          await expect(page.getByTestId('modal-close')).toHaveCount(0)
          await expect(page.getByTestId('schedule-new-cancel')).toHaveText('キャンセル')
          await expect(page.getByTestId('schedule-create-submit')).toHaveText('作成')
          await expectRightOf(
            page.getByTestId('schedule-new-cancel'),
            page.getByTestId('schedule-create-submit'),
          )
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(
        page,
        'キャンセルと同じく、何も作らずに予定のカレンダーのモック（01-month.html）へ戻る',
        () => expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/),
      )
    })

    test('schedule-edit-mock-header-footer 予定の編集のモックを開いた場合、× が無く、フッターのキャンセルで予定の詳細へ戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(EDIT))
      const modal = page.getByTestId('schedule-form-modal')
      await expect(scheduleModalTitle(modal, '予定の編集')).toBeVisible()
      await intro(
        page,
        '予定の編集は、タイトルを左に置き、× を置かず、フッターの右に「キャンセル」と「保存」を置く\n前提 予定の編集の初めの状態のモック（03-initial.html）を開いている',
      )

      await check(
        page,
        'タイトル「予定の編集」が左にあり、右上に × が無く、フッターの右に「キャンセル」と「保存」が並ぶ',
        async () => {
          await expect(page.getByTestId('modal-close')).toHaveCount(0)
          await expect(page.getByTestId('schedule-edit-cancel')).toHaveText('キャンセル')
          await expect(page.getByTestId('schedule-edit-submit')).toHaveText('保存')
          await expectRightOf(
            page.getByTestId('schedule-edit-cancel'),
            page.getByTestId('schedule-edit-submit'),
          )
        },
      )

      await step(page, '「キャンセル」を押す', () =>
        page.getByTestId('schedule-edit-cancel').click(),
      )
      await check(page, '何も変えずに、予定の詳細のモック（01-visit.html）へ戻る', () =>
        expect(page).toHaveURL(/schedule-detail_.+\/01-visit\.html/),
      )
    })

    test('schedule-detail-mock-header-footer 予定の詳細のモックを開いた場合、× が無く、Escape で予定のカレンダーへ戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(DETAIL))
      const modal = page.getByTestId('schedule-detail-modal')
      await expect(scheduleModalTitle(modal, '予定の詳細')).toBeVisible()
      await intro(
        page,
        '予定の詳細は、タイトルを左に置き、× を置かず、フッターの右に「閉じる」と「編集」を置く\n前提 予定の詳細の訪問の予定のモック（01-visit.html）を開いている',
      )

      await check(
        page,
        'タイトル「予定の詳細」が左にあり、右上に × が無く、フッターの右に「閉じる」と「編集」が並ぶ',
        async () => {
          await expect(page.getByTestId('modal-close')).toHaveCount(0)
          await expect(page.getByTestId('schedule-detail-close')).toHaveText('閉じる')
          await expect(page.getByTestId('schedule-detail-edit')).toHaveText('編集')
          await expectRightOf(
            page.getByTestId('schedule-detail-close'),
            page.getByTestId('schedule-detail-edit'),
          )
        },
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(
        page,
        'フッターの「閉じる」と同じく、予定のカレンダーのモック（01-month.html）へ戻る',
        () => expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/),
      )
    })
  })
})
