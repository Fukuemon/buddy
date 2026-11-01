import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { rowTableParts } from '../../selectors/rowTable'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** 職員の一覧を開き、ブローカーでマネージャーとしてログインする。 */
const signInManager = async (page: Page) => {
  await page.goto('/staff')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** マネージャーでログインし、撮影の前に予定の無い職員を 1 人登録して、その ID と名前を返す。 */
const prepareStaff = (label: string) => async (page: Page) => {
  await signInManager(page)
  const staff = newStaff(label)
  const id = await registerStaffId(page.request, await issueManagerToken(page.request), staff)
  return { id, name: staff.name }
}

test.describe('職員の画面の packages/ui のコンポーネント', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}スマートフォンの幅で一覧を開いた場合、行の右端に › が出て横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-list-phone-chevron',
          title:
            'スマートフォンの幅の職員の一覧は、2 行のリストの右端に › を出し、横にスクロールしない',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/staff')
          const { firstRow, firstRowGo } = rowTableParts(page.getByTestId('staff-list-table'))
          await expect(firstRow).toBeVisible()
          await step('幅 390px で職員の一覧を開いている')

          await expect(firstRowGo).toBeVisible()
          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(PHONE_VIEWPORT.width)
          await check('行は 2 行のリストで、右端に › が出て、横にスクロールしない')
        },
      )
    })

    test(`${prefix}「…」から休職にするを開いた場合、区切りの線のある確認のダイアログが出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-leave-dialog-shape',
          title: '休職の確認のダイアログは、本文とフッターの間に区切りの線を引く',
          actor: MANAGER,
          variant,
        },
        prepareStaff('leave-shape'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
          await step('撮影の前に登録した職員の詳細を開いている')

          await step('「…」から「休職にする」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-leave').click()
          const dialog = page.getByTestId('staff-leave-dialog')
          await expect(dialog.getByTestId('staff-leave-assignments')).toBeVisible()
          await check('確認のダイアログが出て、フッターの上に区切りの線がある')
        },
      )
    })

    test(`${prefix}休職の確認のダイアログをキャンセルした場合、フォーカスが「…」のボタンに戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-leave-cancel-focus',
          title:
            '「…」から開いた休職の確認のダイアログをキャンセルすると、フォーカスが「…」のボタンに戻る',
          actor: MANAGER,
          variant,
        },
        prepareStaff('leave-focus'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
          await step('撮影の前に登録した職員の詳細を開いている')

          await step('キーボードで「…」を開いて「休職にする」を選び、「キャンセル」で閉じる')
          await page.getByTestId('staff-detail-menu').focus()
          await page.keyboard.press('Enter')
          await expect(page.getByTestId('staff-detail-leave')).toBeFocused()
          await page.keyboard.press('Enter')
          const cancel = page.getByTestId('staff-leave-dialog').getByTestId('staff-leave-cancel')
          await cancel.focus()
          await page.keyboard.press('Enter')

          await expect(page.getByTestId('staff-leave-dialog')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-menu')).toBeFocused()
          await check('ダイアログが閉じ、「…」のボタンにフォーカスの枠が出る')
        },
      )
    })

    test(`${prefix}「…」から退職にするを開いた場合、区切りの線のある確認のダイアログが出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-retire-dialog-shape',
          title: '退職の確認のダイアログは、本文とフッターの間に区切りの線を引く',
          actor: MANAGER,
          variant,
        },
        prepareStaff('retire-shape'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
          await step('撮影の前に登録した、予定の無い職員の詳細を開いている')

          await step('「…」から「退職にする」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-retire').click()
          const dialog = page.getByTestId('staff-retire-dialog')
          await expect(dialog.getByTestId('staff-retire-submit')).toBeEnabled()
          await check('確認のダイアログが出て、フッターの上に区切りの線がある')
        },
      )
    })

    test(`${prefix}登録のダイアログで入力欄から背景へドラッグした場合、ダイアログが閉じないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-new-drag-outside',
          title: '職員の登録のダイアログで、入力欄から背景へドラッグしても閉じない',
          actor: MANAGER,
          variant,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/staff')
          await page.getByTestId('staff-list-new').click()
          const dialog = page.getByTestId('staff-new-dialog')
          const name = dialog.getByTestId('staff-new-name')
          await name.fill('ドラッグ 確認')
          await step('職員の登録のダイアログを開き、名前を入れている')

          await step('名前の欄の文字を選ぶように押したまま、背景の左上まで動かして離す')
          const box = await name.boundingBox()
          if (box === null) throw new Error('名前の欄の位置を取れない')
          await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(8, 8, { steps: 10 })
          await page.mouse.up()

          await expect(dialog).toBeVisible()
          await expect(name).toHaveValue('ドラッグ 確認')
          await check('ダイアログは閉じず、入れた名前が残る')
        },
      )
    })
  }
})
