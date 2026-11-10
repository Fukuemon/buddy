import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'
import { rowTableParts } from '../../selectors/rowTable'

/** 録画の外で、マネージャーのトークンで予定の無い職員を 1 人登録し、その ID を返す。 */
const registerStaff = async (request: APIRequestContext, label: string) =>
  registerStaffId(request, await issueManagerToken(), newStaff(label))

/** 職員 id の詳細を開き、「…」のボタンが出るまで待つ。 */
const openDetail = async (page: Page, id: string) => {
  await page.goto(`/staff/${id}`)
  await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
}

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('職員の画面の packages/ui のコンポーネント', () => {
  test.describe(`${MANAGER}、幅 390px`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('staff-list-phone-chevron スマートフォンの幅で一覧を開いた場合、行の右端に › が出て横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/staff')
      const { firstRow, firstRowGo } = rowTableParts(page.getByTestId('staff-list-table'))
      await expect(firstRow).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅の職員の一覧は、2 行のリストの右端に › を出し、横にスクロールしない',
      )

      await check(page, '前提 幅 390px で職員の一覧を開いている', () =>
        expect(firstRow).toBeVisible(),
      )
      await check(page, '行は 2 行のリストで、右端に › が出て、横にスクロールしない', async () => {
        await expect(firstRowGo).toBeVisible()
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(PHONE_VIEWPORT.width)
      })
    })
  })

  test.describe(MANAGER, () => {
    test.use({ storageState: LOGIN_STATE })

    test('staff-leave-dialog-shape 「…」から休職にするを開いた場合、区切りの線のある確認のダイアログが出ること', async ({
      context,
      request,
    }) => {
      const id = await registerStaff(request, 'leave-shape')

      const page = await context.newPage()
      await openDetail(page, id)
      await intro(page, '休職の確認のダイアログは、本文とフッターの間に区切りの線を引く')

      await check(page, '前提 撮影の前に登録した職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-menu')).toBeVisible(),
      )
      await step(page, '「…」から「休職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-leave').click()
      })
      await check(page, '確認のダイアログが出て、フッターの上に区切りの線がある', () =>
        expect(
          page.getByTestId('staff-leave-dialog').getByTestId('staff-leave-assignments'),
        ).toBeVisible(),
      )
    })

    test('staff-leave-cancel-focus 休職の確認のダイアログをキャンセルした場合、フォーカスが「…」のボタンに戻ること', async ({
      context,
      request,
    }) => {
      const id = await registerStaff(request, 'leave-focus')

      const page = await context.newPage()
      await openDetail(page, id)
      await intro(
        page,
        '「…」から開いた休職の確認のダイアログをキャンセルすると、フォーカスが「…」のボタンに戻る',
      )

      await check(page, '前提 撮影の前に登録した職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-menu')).toBeVisible(),
      )
      await step(
        page,
        'キーボードで「…」を開いて「休職にする」を選び、「キャンセル」で閉じる',
        async () => {
          await page.getByTestId('staff-detail-menu').focus()
          await page.keyboard.press('Enter')
          await expect(page.getByTestId('staff-detail-leave')).toBeFocused()
          await page.keyboard.press('Enter')
          const cancel = page.getByTestId('staff-leave-dialog').getByTestId('staff-leave-cancel')
          await cancel.focus()
          await page.keyboard.press('Enter')
        },
      )
      await check(page, 'ダイアログが閉じ、「…」のボタンにフォーカスの枠が出る', async () => {
        await expect(page.getByTestId('staff-leave-dialog')).toHaveCount(0)
        await expect(page.getByTestId('staff-detail-menu')).toBeFocused()
      })
    })

    test('staff-retire-dialog-shape 「…」から退職にするを開いた場合、区切りの線のある確認のダイアログが出ること', async ({
      context,
      request,
    }) => {
      const id = await registerStaff(request, 'retire-shape')

      const page = await context.newPage()
      await openDetail(page, id)
      await intro(page, '退職の確認のダイアログは、本文とフッターの間に区切りの線を引く')

      await check(page, '前提 撮影の前に登録した、予定の無い職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-menu')).toBeVisible(),
      )
      await step(page, '「…」から「退職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-retire').click()
      })
      await check(page, '確認のダイアログが出て、フッターの上に区切りの線がある', () =>
        expect(
          page.getByTestId('staff-retire-dialog').getByTestId('staff-retire-submit'),
        ).toBeEnabled(),
      )
    })

    test('staff-new-drag-outside 登録のダイアログで入力欄から背景へドラッグした場合、ダイアログが閉じないこと', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-new')).toBeVisible()
      await intro(page, '職員の登録のダイアログで、入力欄から背景へドラッグしても閉じない')

      const dialog = page.getByTestId('staff-new-dialog')
      const name = dialog.getByTestId('staff-new-name')
      await step(page, '職員の登録のダイアログを開き、名前を入れる', async () => {
        await page.getByTestId('staff-list-new').click()
        await name.fill('ドラッグ 確認')
      })
      await step(
        page,
        '名前の欄の文字を選ぶように押したまま、背景の左上まで動かして離す',
        async () => {
          const box = await name.boundingBox()
          if (box === null) throw new Error('名前の欄の位置を取れない')
          await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(8, 8, { steps: 10 })
          await page.mouse.up()
        },
      )
      await check(page, 'ダイアログは閉じず、入れた名前が残る', async () => {
        await expect(dialog).toBeVisible()
        await expect(name).toHaveValue('ドラッグ 確認')
      })
    })
  })
})
