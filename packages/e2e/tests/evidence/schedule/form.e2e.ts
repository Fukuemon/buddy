import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { listScheduleTitles } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { dismissBrowserDialog } from '../../widgets/browserDialog/actions/browserDialog'

/** 日の表示を開き、予定の一覧が届いて列が出るまで待つ。 */
const openDayView = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe(`予定の作成のフォーム（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-form-empty-service-time 訪問の予定で提供時間の欄を空にした場合、日時の要約の終了時間と提供時間が「-」になること', async ({
      page,
    }) => {
      await openDayView(page)
      await intro(
        page,
        '訪問の予定で提供時間の欄を空にすると、日時の要約の終了時間と提供時間が「-」になる\n前提 予定のカレンダーを日の表示で開いている',
      )

      await step(page, '「予定を作成」を押し、訪問の予定を選んで、訪問日時を開く', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-visit').check()
        await page.getByTestId('schedule-field-date-time').click()
        await expect(page.getByTestId('schedule-form-service-time')).toBeVisible()
      })

      await step(page, '提供時間（分）の欄を空にする', async () => {
        await page.getByTestId('schedule-form-service-time').click()
        await page.getByTestId('schedule-form-service-time').fill('')
      })
      await check(
        page,
        '左の訪問日時の要約が「…〜-（- 分、…）」になり、終了時間が「-」になる',
        async () => {
          await expect(page.getByTestId('schedule-field-date-time')).toContainText('〜-（- 分')
          await expect(page.getByTestId('schedule-form-end-time')).toHaveText('終了時間 -')
        },
      )
    })

    test('schedule-form-kind-switch-confirm 日付を変えてから予定の種類を切り替えて閉じた場合、変更を破棄するかの確認が出ること', async ({
      page,
    }) => {
      await openDayView(page)
      await intro(
        page,
        '日付を変えてから予定の種類を切り替えて閉じると、変更を破棄するかの確認が出る\n前提 予定のカレンダーを日の表示で開いている',
      )

      await step(page, '「予定を作成」を押し、通常の予定の日付を変える', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-normal').check()
        await page.getByTestId('schedule-field-date-time').click()
        await page.getByTestId('schedule-form-date').fill('2026-10-30')
        await expect(page.getByTestId('schedule-field-date-time')).toContainText(
          '2026年10月30日（金）',
        )
      })

      await step(page, '予定の種類を訪問に切り替える', () =>
        page.getByTestId('schedule-kind-tab-visit').check(),
      )
      await check(page, '訪問の予定のフォームに、変えた日付が残る', () =>
        expect(page.getByTestId('schedule-field-date-time')).toContainText('2026年10月30日（金）'),
      )

      // ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出して「キャンセル」で閉じる
      const message = await dismissBrowserDialog(page, () =>
        step(page, 'フッターの「キャンセル」を押す', () =>
          page.getByTestId('schedule-new-cancel').click(),
        ),
      )
      await check(
        page,
        [
          `確認「${message}」が出て、キャンセルするとフォームが残る`,
          `（撮影のため、ブラウザの確認のダイアログは録画に映らないので、出た文を字幕に出す）確認「${message}」が出たので、キャンセルを押した`,
        ].join('\n'),
        async () => {
          expect(message).toBe('変更が破棄されますがよろしいですか？')
          await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
        },
      )
    })

    test('schedule-form-overnight-visit 訪問の予定の作成で、開始時間を 23 時、提供時間を 90 分にした場合、終了時間が翌日の 0 時 30 分と出ること', async ({
      page,
    }) => {
      await openDayView(page)
      await intro(
        page,
        '訪問の予定の作成で、開始時間を 23 時、提供時間を 90 分にすると、終了時間が翌日の 0 時 30 分と出る\n前提 予定のカレンダーを日の表示で開いている',
      )

      await step(page, '「予定を作成」を押し、訪問の予定の訪問日時を開く', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-visit').check()
        await page.getByTestId('schedule-field-date-time').click()
      })

      await step(
        page,
        'サービスコードの「医」を選び、開始時間を 23:00、提供時間を 90 分にする',
        async () => {
          await page.getByTestId('service-code-医').check()
          await page.getByTestId('schedule-form-start-time').fill('23:00')
          await page.getByTestId('schedule-form-service-time').fill('90')
        },
      )
      await check(
        page,
        '終了時間が「終了時間 翌 00:30」と出て、訪問日時の要約も「23:00〜翌 00:30」になる',
        async () => {
          await expect(page.getByTestId('schedule-form-end-time')).toHaveText('終了時間 翌 00:30')
          await expect(page.getByTestId('schedule-field-date-time')).toContainText(
            '23:00〜翌 00:30（90 分、医）',
          )
        },
      )
    })

    test('schedule-form-overnight-normal-without-next-day 通常の予定の作成で、22 時から 1 時にし、翌日を選ばずに保存した場合、終了時間に誤りの文が出て保存されないこと', async ({
      page,
      request,
    }) => {
      const title = '夜勤（翌日を選ばない）'
      const date = '2026-12-22'
      await openDayView(page)
      await intro(
        page,
        '通常の予定の作成で、22 時から 1 時にし、翌日を選ばずに保存すると、終了時間に誤りの文が出て保存されない\n前提 予定のカレンダーを日の表示で開いている',
      )

      await step(
        page,
        `「予定を作成」を押し、通常の予定のタイトルに「${title}」と入れ、予定者を選ぶ`,
        async () => {
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-normal').check()
          await page.getByTestId('schedule-field-title').click()
          await page.getByTestId('schedule-form-title').fill(title)
          await page.getByTestId('schedule-field-staff').click()
          await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
        },
      )

      await step(
        page,
        `予定日時で、日付を ${date}、開始時間を 22:00、終了時間を 01:00 にし、「終了は翌日」を選ばない`,
        async () => {
          await page.getByTestId('schedule-field-date-time').click()
          await page.getByTestId('schedule-form-date').fill(date)
          await page.getByTestId('schedule-form-start-time').fill('22:00')
          await page.getByTestId('schedule-form-end-time').fill('01:00')
          await expect(page.getByTestId('schedule-form-ends-next-day')).not.toBeChecked()
        },
      )

      await step(page, '「作成」を押す', () => page.getByTestId('schedule-create-submit').click())
      await check(
        page,
        `終了時間に「終了時間は開始時間より後にしてください」が出てフォームが残り、${date} の予定の一覧に「${title}」は無い`,
        async () => {
          await expect(page.getByTestId('schedule-form-modal')).toContainText(
            '終了時間は開始時間より後にしてください',
          )
          const token = await issueAccessToken(request, LOGIN_EMAIL)
          expect(
            await listScheduleTitles(request, token, STAFF_FORM.facilityId, date),
          ).not.toContain(title)
        },
      )
    })
  })
})
