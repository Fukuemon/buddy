import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { newUnitName } from '../../fixtures/organization'
import { PHONE_VIEWPORT, prepareOutsideRecording } from '../../fixtures/recording'
import { SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { dismissBrowserDialog } from '../../widgets/browserDialog/actions/browserDialog'

/** ログインした職員の通常の予定を、日の表示から作る。作った予定のタイトルを返す。 */
const createSchedule = async (page: Page) => {
  await page.goto('/schedule?view=day')
  const title = `打ち合わせ ${Date.now()}`
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
  return title
}

/** 日の表示で、タイトルが title の予定を押し、予定の詳細を開く。 */
const openDetail = async (page: Page, title: string) => {
  await page
    .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
    .click()
  await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
  return page.getByTestId('schedule-detail-modal')
}

/** 予定を作ってキャンセルし、その予定の詳細の URL を返す。 */
const createCancelledSchedule = async (page: Page) => {
  const title = await createSchedule(page)
  const detail = await openDetail(page, title)
  const url = page.url()
  await detail.getByTestId('schedule-detail-cancel-schedule').click()
  await page.getByTestId('schedule-cancel-reason').fill('利用者の都合で取りやめ')
  await page.getByTestId('schedule-cancel-submit').click()
  await expect(page.getByTestId('schedule-cancel-dialog')).toHaveCount(0)
  return url
}

const openDay = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

// 右上の × の有無は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版で通るフッターのボタンだけを見る
test.describe('ダイアログの閉じるボタン', () => {
  test.describe(`入力と予定の詳細のダイアログ（${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test(
      'input-dialog-shape 入力のダイアログを開いた場合、右上に × が無く、フッターにキャンセルと確定のボタンがあること',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto('/organization')
        await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
        await intro(
          page,
          '部署とチームの画面で「部署を作る」を押し、ダイアログの右上とフッターを見る',
        )

        await step(page, '「部署を作る」を押す', () =>
          page.getByTestId('organization-list-department-new').click(),
        )
        const dialog = page.getByTestId('organization-list-department-dialog')
        await check(
          page,
          '「部署を作る」のダイアログの右上に × が無く、フッターに「キャンセル」と「作る」が並ぶ',
          async () => {
            await expect(dialog.getByTestId('organization-list-department-cancel')).toBeVisible()
            await expect(dialog.getByTestId('organization-list-department-submit')).toBeVisible()
          },
        )
      },
    )

    test('input-dialog-escape 入力のダイアログで何も変えずに Escape キーを押した場合、何も変えずに閉じること', async ({
      page,
    }) => {
      const name = newUnitName('部署')
      await page.goto('/organization')
      const rows = page.getByTestId(/^organization-list-department-row-/)
      await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
      const before = await rows.count()
      await intro(
        page,
        `「部署を作る」のダイアログで名前を入れずに Escape キーを押し、閉じることを見る\n前提 一覧の部署は ${before} 件`,
      )

      const dialog = page.getByTestId('organization-list-department-dialog')
      await step(page, '「部署を作る」のダイアログを、何も入れずに開く', async () => {
        await page.getByTestId('organization-list-department-new').click()
        await expect(dialog).toBeVisible()
      })
      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, `ダイアログが閉じ、一覧の部署は ${before} 件のまま変わらない`, async () => {
        await expect(dialog).toHaveCount(0)
        await expect(rows).toHaveCount(before)
        await expect(rows.filter({ hasText: name })).toHaveCount(0)
      })
    })

    test('schedule-form-cancel-confirm 予定の作成のダイアログで入力を変えてからキャンセルを押した場合、破棄してよいかを確認すること', async ({
      page,
    }) => {
      await openDay(page)
      await intro(
        page,
        '予定の作成のダイアログでタイトルを入れてから「キャンセル」を押し、破棄の確認を見る',
      )

      const modal = page.getByTestId('schedule-form-modal')
      await step(page, '予定の作成のダイアログを開く', async () => {
        await page.getByTestId('schedule-create-open').click()
        await expect(modal).toBeVisible()
      })
      await step(page, '通常の予定にして、タイトルに「打ち合わせ」と入れる', async () => {
        await page.getByTestId('schedule-kind-tab-normal').check()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill('打ち合わせ')
      })

      // ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出して「キャンセル」で閉じる
      const message = await dismissBrowserDialog(page, () =>
        step(page, 'フッターの「キャンセル」を押す', () =>
          modal.getByTestId('schedule-new-cancel').click(),
        ),
      )
      await check(
        page,
        `（撮影のため、ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出す）\n確認「${message}」が出て、キャンセルすると入れたタイトルが残る`,
        async () => {
          expect(message).toBe('変更が破棄されますがよろしいですか？')
          await expect(modal).toBeVisible()
          await expect(page.getByTestId('schedule-form-title')).toHaveValue('打ち合わせ')
        },
      )
    })

    test(
      'schedule-detail-close 予定の詳細を開いた場合、右上に × が無く、フッターの閉じるで閉じること',
      { tag: '@compare' },
      async ({ browser, context }) => {
        const title = await prepareOutsideRecording(
          browser,
          { storageState: LOGIN_STATE },
          createSchedule,
        )

        const page = await context.newPage()
        await openDay(page)
        await intro(
          page,
          `予定の詳細を開き、右上とフッターを見て、「閉じる」で閉じる\n前提 撮影の前に ${LOGIN_STAFF.name} の今日の予定「${title}」を作った`,
        )

        const modal = page.getByTestId('schedule-detail-modal')
        await step(page, `日の表示で、${LOGIN_STAFF.name} の「${title}」を押す`, async () => {
          await openDetail(page, title)
        })
        await check(page, '「予定の詳細」の右上に × が無く、フッターに「閉じる」がある', () =>
          expect(modal.getByTestId('schedule-detail-close')).toBeVisible(),
        )

        await step(page, 'フッターの「閉じる」を押す', () =>
          modal.getByTestId('schedule-detail-close').click(),
        )
        await check(page, 'ダイアログが閉じ、予定のカレンダーに戻る', () =>
          expect(modal).toBeHidden(),
        )
      },
    )

    test('schedule-cancelled-detail-close キャンセルした予定の詳細を開いた場合、右上の × で閉じること', async ({
      browser,
      context,
    }) => {
      const url = await prepareOutsideRecording(
        browser,
        { storageState: LOGIN_STATE },
        createCancelledSchedule,
      )

      const page = await context.newPage()
      await page.goto(url)
      const modal = page.getByTestId('schedule-detail-modal')
      await expect(modal.getByTestId('schedule-detail-cancel')).toBeVisible()
      await intro(
        page,
        `キャンセルした予定の詳細を開き、右上の × で閉じる\n前提 撮影の前に ${LOGIN_STAFF.name} の今日の予定を作ってキャンセルし、その詳細を開いている`,
      )

      await check(page, 'キャンセルした予定の詳細にはフッターが無く、右上に × がある', async () => {
        await expect(modal.getByTestId('schedule-detail-close')).toHaveCount(0)
        await expect(modal.getByTestId('modal-close')).toBeVisible()
      })

      await step(page, '右上の × を押す', () => modal.getByTestId('modal-close').click())
      await check(page, 'ダイアログが閉じ、予定のカレンダーに戻る', () =>
        expect(modal).toBeHidden(),
      )
    })
  })

  test.describe(`スマートフォンの幅の予定の作成のダイアログ（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('schedule-form-phone-footer 幅 390px で予定の作成のダイアログを開いた場合、フッターのキャンセルが本文をスクロールせずに見えること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId('schedule-create-open')).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅で予定の作成のダイアログを開き、フッターの「キャンセル」を見る\n前提 スマートフォンの幅（390x844）で、予定のカレンダーを開いている',
      )

      await step(page, '「予定を作成」を押す', () =>
        page.getByTestId('schedule-create-open').click(),
      )
      const modal = page.getByTestId('schedule-form-modal')
      const cancel = modal.getByTestId('schedule-new-cancel')
      await check(
        page,
        '右上に × が無く、本文をスクロールしないまま、画面の下端に「キャンセル」と「作成」が見える',
        async () => {
          await expect(modal).toBeVisible()
          await expect(cancel).toBeInViewport()
          await expect(modal.getByTestId('modal-close')).toHaveCount(0)
        },
      )

      await step(page, '「キャンセル」を押す', () => cancel.click())
      await check(page, 'ダイアログが閉じ、予定のカレンダーに戻る', () =>
        expect(modal).toBeHidden(),
      )
    })
  })
})
