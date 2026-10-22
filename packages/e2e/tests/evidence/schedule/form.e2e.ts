import { expect, test, type Page } from '@playwright/test'

import { LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtIdp } from '../../screens/login'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtIdp(page, LOGIN_NAME)
}

/** 日の表示を開き、予定の一覧が届いて列が出るまで待つ。 */
const openDayView = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成のフォーム', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}訪問の予定で提供時間の欄を空にした場合、日時の要約の終了時間と提供時間が「-」になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-form-empty-service-time',
            title:
              '訪問の予定で提供時間の欄を空にすると、日時の要約の終了時間と提供時間が「-」になる',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openDayView(page)
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、訪問の予定を選んで、訪問日時を開く')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('schedule-form-service-time')).toBeVisible()

            await step('提供時間（分）の欄を空にする')
            await page.getByTestId('schedule-form-service-time').click()
            await page.getByTestId('schedule-form-service-time').fill('')
            await expect(page.getByTestId('schedule-field-date-time')).toContainText('- -（- 分')
            await expect(page.getByTestId('schedule-form-end-time')).toHaveText('終了時間 -')
            await check('左の訪問日時の要約が「- -（- 分、…）」になり、終了時間が「-」になる')
          },
        )
      })

      test(`${prefix}日付を変えてから予定の種類を切り替えて閉じた場合、変更を破棄するかの確認が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-form-kind-switch-confirm',
            title: '日付を変えてから予定の種類を切り替えて閉じると、変更を破棄するかの確認が出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openDayView(page)
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、通常の予定の日付を変える')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-normal').check()
            await page.getByTestId('schedule-field-date-time').click()
            await page.getByTestId('schedule-form-date').fill('2026-10-30')
            await expect(page.getByTestId('schedule-field-date-time')).toContainText('2026-10-30')

            await step('予定の種類を訪問に切り替える')
            await page.getByTestId('schedule-kind-tab-visit').check()
            await expect(page.getByTestId('schedule-field-date-time')).toContainText('2026-10-30')
            await check('訪問の予定のフォームに、変えた日付が残る')

            // ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出して「キャンセル」で閉じる
            const confirmed = page.waitForEvent('dialog').then(async (dialog) => {
              const message = dialog.message()
              await dialog.dismiss()
              return message
            })
            await step('閉じるボタンを押す')
            await page.getByTestId('modal-close').click()
            const message = await confirmed
            expect(message).toBe('変更が破棄されますがよろしいですか？')
            await step(
              `（撮影のため、ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出す）確認「${message}」が出たので、キャンセルを押す`,
            )
            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
            await check(`確認「${message}」が出て、キャンセルするとフォームが残る`)
          },
        )
      })

      test(`${prefix}訪問の終了が日をまたぐ開始時間で作ろうとした場合、送る前に誤りの文が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-form-overnight-visit',
            title: '訪問の終了が日をまたぐ開始時間で作ろうとすると、送る前に誤りの文が出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openDayView(page)
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、訪問の予定の訪問日時を開く')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-date-time').click()

            await step('開始時間を 23:50、提供時間を 29 分にする')
            await page.getByTestId('schedule-form-start-time').fill('23:50')
            await page.getByTestId('schedule-form-service-time').fill('29')
            await expect(page.getByTestId('schedule-field-date-time')).toContainText('23:50')

            await step('「作成」を押す')
            await page.getByTestId('schedule-create-submit').click()
            await expect(page.getByTestId('schedule-form-modal')).toContainText(
              '終了が日をまたがないよう、開始時間か提供時間を変えてください',
            )
            await check(
              '「終了が日をまたがないよう、開始時間か提供時間を変えてください」が出て、フォームが残る',
            )
          },
        )
      })
    }
  })
})
