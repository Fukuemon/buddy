import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { newUnitName } from '../../fixtures/organization'
import { SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { signInAtBroker } from '../../screens/login'
import { commonShapeParts } from '../../selectors/commonShape'
import { dismissBrowserDialog } from '../../widgets/browserDialog/actions/browserDialog'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** 部署とチームの画面を開いてログインする。 */
const signInToOrganization = async (page: Page) => {
  await page.goto('/organization')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 予定のカレンダーを開いてログインする。 */
const signInToSchedule = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** ログインした職員の通常の予定を、日の表示から作る。作った予定のタイトルを返す。 */
const createSchedule = async (page: Page) => {
  await signInToSchedule(page)
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
  await page.goto('/schedule?view=day')
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

test.describe('ダイアログの閉じるボタン', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''
    const isBefore = variant.name === 'before'

    test(`${prefix}入力のダイアログを開いた場合、右上に × が無く、フッターにキャンセルと確定のボタンがあること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'input-dialog-shape',
          title: '部署とチームの画面で「部署を作る」を押し、ダイアログの右上とフッターを見る',
          actor: ACTOR,
          variant,
        },
        signInToOrganization,
        async ({ page, step, check }) => {
          await page.goto('/organization')
          await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
          await step('部署とチームの画面を開いている')

          await step('「部署を作る」を押す')
          await page.getByTestId('organization-list-department-new').click()
          const dialog = page.getByTestId('organization-list-department-dialog')
          await expect(dialog.getByTestId('organization-list-department-cancel')).toBeVisible()
          await expect(dialog.getByTestId('organization-list-department-submit')).toBeVisible()
          if (isBefore) {
            await expect(commonShapeParts(dialog).closeButton).toBeVisible()
            await check(
              '「部署を作る」のダイアログの右上に × があり、フッターに「キャンセル」と「作る」が並ぶ',
            )
          } else {
            await expect(commonShapeParts(dialog).closeButton).toHaveCount(0)
            await check(
              '「部署を作る」のダイアログの右上に × が無く、フッターに「キャンセル」と「作る」が並ぶ',
            )
          }
        },
      )
    })

    test(`${prefix}入力のダイアログで何も変えずに Escape キーを押した場合、何も変えずに閉じること`, async ({
      browser,
    }) => {
      test.skip(isBefore, '閉じ方は改修の前後で変わらないので、改修後だけを撮る')
      const name = newUnitName('部署')
      await recordPrEvidence(
        browser,
        {
          name: 'input-dialog-escape',
          title: '「部署を作る」のダイアログで名前を入れずに Escape キーを押し、閉じることを見る',
          actor: ACTOR,
          variant,
        },
        signInToOrganization,
        async ({ page, step, check }) => {
          await page.goto('/organization')
          const rows = page.getByTestId(/^organization-list-department-row-/)
          await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
          const before = await rows.count()
          await page.getByTestId('organization-list-department-new').click()
          const dialog = page.getByTestId('organization-list-department-dialog')
          await expect(dialog).toBeVisible()
          await step(
            `「部署を作る」のダイアログを、何も入れずに開いている（一覧の部署は ${before} 件）`,
          )

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(dialog).toHaveCount(0)
          await expect(rows).toHaveCount(before)
          await expect(rows.filter({ hasText: name })).toHaveCount(0)
          await check(`ダイアログが閉じ、一覧の部署は ${before} 件のまま変わらない`)
        },
      )
    })

    test(`${prefix}予定の作成のダイアログで入力を変えてからキャンセルを押した場合、破棄してよいかを確認すること`, async ({
      browser,
    }) => {
      test.skip(isBefore, '破棄の確認は改修の前後で変わらないので、改修後だけを撮る')
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-form-cancel-confirm',
          title:
            '予定の作成のダイアログでタイトルを入れてから「キャンセル」を押し、破棄の確認を見る',
          actor: ACTOR,
          variant,
        },
        signInToSchedule,
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
          await page.getByTestId('schedule-create-open').click()
          const modal = page.getByTestId('schedule-form-modal')
          await expect(modal).toBeVisible()
          await step('予定の作成のダイアログを開いている')

          await step('通常の予定にして、タイトルに「打ち合わせ」と入れる')
          await page.getByTestId('schedule-kind-tab-normal').check()
          await page.getByTestId('schedule-field-title').click()
          await page.getByTestId('schedule-form-title').fill('打ち合わせ')

          // ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出して「キャンセル」で閉じる
          const message = await dismissBrowserDialog(page, async () => {
            await step('フッターの「キャンセル」を押す')
            await modal.getByTestId('schedule-new-cancel').click()
          })
          expect(message).toBe('変更が破棄されますがよろしいですか？')
          await step(
            `（撮影のため、ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出す）確認「${message}」が出たので、キャンセルを押す`,
          )
          await expect(modal).toBeVisible()
          await expect(page.getByTestId('schedule-form-title')).toHaveValue('打ち合わせ')
          await check(`確認「${message}」が出て、キャンセルすると入れたタイトルが残る`)
        },
      )
    })

    test(`${prefix}予定の詳細を開いた場合、右上に × が無く、フッターの閉じるで閉じること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-detail-close',
          title: '予定の詳細を開き、右上とフッターを見て、「閉じる」で閉じる',
          actor: ACTOR,
          variant,
        },
        createSchedule,
        async ({ page, step, check }, title) => {
          await step(`日の表示で、${LOGIN_STAFF.name} の「${title}」を押す`)
          const modal = await openDetail(page, title)
          await expect(modal.getByTestId('schedule-detail-close')).toBeVisible()
          if (isBefore) {
            await expect(modal.getByTestId('modal-close')).toBeVisible()
            await check('「予定の詳細」の右上に × があり、フッターに「閉じる」がある')
          } else {
            await expect(modal.getByTestId('modal-close')).toHaveCount(0)
            await check('「予定の詳細」の右上に × が無く、フッターに「閉じる」がある')
          }

          await step('フッターの「閉じる」を押す')
          await modal.getByTestId('schedule-detail-close').click()
          await expect(modal).toBeHidden()
          await check('ダイアログが閉じ、予定のカレンダーに戻る')
        },
      )
    })

    test(`${prefix}キャンセルした予定の詳細を開いた場合、右上の × で閉じること`, async ({
      browser,
    }) => {
      test.skip(isBefore, 'キャンセルした予定の × は改修の前後で変わらないので、改修後だけを撮る')
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-cancelled-detail-close',
          title: 'キャンセルした予定の詳細を開き、右上の × で閉じる',
          actor: ACTOR,
          variant,
        },
        createCancelledSchedule,
        async ({ page, step, check }, url) => {
          await page.goto(url)
          const modal = page.getByTestId('schedule-detail-modal')
          await expect(modal.getByTestId('schedule-detail-cancel')).toBeVisible()
          await expect(modal.getByTestId('schedule-detail-close')).toHaveCount(0)
          await expect(modal.getByTestId('modal-close')).toBeVisible()
          await check('キャンセルした予定の詳細にはフッターが無く、右上に × がある')

          await step('右上の × を押す')
          await modal.getByTestId('modal-close').click()
          await expect(modal).toBeHidden()
          await check('ダイアログが閉じ、予定のカレンダーに戻る')
        },
      )
    })

    test(`${prefix}幅 390px で予定の作成のダイアログを開いた場合、フッターのキャンセルが本文をスクロールせずに見えること`, async ({
      browser,
    }) => {
      test.skip(isBefore, 'フッターの位置は改修の前後で変わらないので、改修後だけを撮る')
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-form-phone-footer',
          title: 'スマートフォンの幅で予定の作成のダイアログを開き、フッターの「キャンセル」を見る',
          actor: ACTOR,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInToSchedule,
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
          await step('スマートフォンの幅（390x844）で、予定のカレンダーを開いている')

          await step('「予定を作成」を押す')
          await page.getByTestId('schedule-create-open').click()
          const modal = page.getByTestId('schedule-form-modal')
          await expect(modal).toBeVisible()
          const cancel = modal.getByTestId('schedule-new-cancel')
          await expect(cancel).toBeInViewport()
          await expect(modal.getByTestId('modal-close')).toHaveCount(0)
          await check(
            '右上に × が無く、本文をスクロールしないまま、画面の下端に「キャンセル」と「作成」が見える',
          )

          await step('「キャンセル」を押す')
          await cancel.click()
          await expect(modal).toBeHidden()
          await check('ダイアログが閉じ、予定のカレンダーに戻る')
        },
      )
    })
  }
})
