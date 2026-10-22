import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { HAYASHI } from '../../fixtures/env'
import {
  deleteGoogleEvent,
  findGoogleEvent,
  holdGoogleChanges,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'

const findEvent = (request: APIRequestContext, summary: string) =>
  findGoogleEvent(request, HAYASHI.calendarId, summary)

/** 結び付けの画面で、林のカレンダーを読めると確かめてから結び付ける。 */
const linkHayashi = async (page: Page) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-open-${HAYASHI.id}`).click()
  await expect(page.getByTestId('calendar-link-input')).toHaveValue(HAYASHI.calendarId)
  await page.getByTestId('calendar-link-check').click()
  await expect(page.getByTestId('calendar-link-check-result')).toContainText('読めました。')
  await page.getByTestId('calendar-link-submit').click()
  await expect(page.getByTestId(`calendar-link-calendar-id-${HAYASHI.id}`)).toHaveText(
    HAYASHI.calendarId,
  )
}

/** buddy で林の予定を作り、林の Google カレンダーに出るのを待って、Google の予定の ID を返す。 */
const createHayashiSchedule = async (page: Page, request: APIRequestContext, title: string) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${HAYASHI.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()

  await expect.poll(async () => (await findEvent(request, title))?.status).toBe('confirmed')
  return (await findEvent(request, title))?.id ?? ''
}

/** 日の表示で、林の予定のうちタイトルが from のものを開き、タイトルを to に変える。開いた予定の ID を返す。 */
const renameHayashiSchedule = async (page: Page, from: string, to: string) => {
  await page.goto('/schedule?view=day')
  await page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: from })
    .click()
  await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
  const scheduleId = scheduleIdFromUrl(page.url())
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(to)
  await page.getByTestId('schedule-edit-submit').click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
  return scheduleId
}

/** 確かめが要る予定の一覧の、予定の行。前のテストが同じ職員の行を残していても、今回の予定の行だけを指す。 */
const reviewRow = (page: Page, scheduleId: string) =>
  page.getByTestId(`calendar-review-row-schedule-${scheduleId}`)

/** 確かめが要る予定の一覧を開き、予定の行が出るまで読み直す。書き出しの処理が Google の応答を受けるまでは出ない。 */
const openReviewUntilRow = async (page: Page, scheduleId: string) => {
  await page.goto('/schedule/review')
  await expect(async () => {
    await page.reload()
    await expect(reviewRow(page, scheduleId)).toBeVisible()
  }).toPass()
}

/** 確かめが要る予定の一覧で、予定の行を buddy の内容で書き直す。確かめのダイアログの文が notice を含むことを確かめてから押す。 */
const rewriteRow = async (page: Page, scheduleId: string, notice: string) => {
  await reviewRow(page, scheduleId)
    .getByTestId(/^calendar-review-rewrite-/)
    .click()
  const dialog = page.getByTestId('calendar-rewrite-dialog')
  await expect(dialog).toContainText(notice)
  await page.getByTestId('calendar-rewrite-submit').click()
  await expect(dialog).toBeHidden()
  await expect(reviewRow(page, scheduleId)).toHaveCount(0)
}

test.describe('確かめが要る予定', () => {
  test.describe('Google カレンダーへの書き出し', () => {
    // 途中で落ちても、後の spec が Google の変更を受け取れ、次のテストとやり直しで林にもう一度結び付けられるようにする
    test.afterEach(async ({ page, request }) => {
      await holdGoogleChanges(request, false)
      await page.goto('/schedule/link')
      const remove = page.getByTestId(`calendar-link-remove-${HAYASHI.id}`)
      await expect(page.getByTestId(`calendar-link-row-${HAYASHI.id}`)).toBeVisible()
      if (await remove.isVisible()) {
        await remove.click()
        await expect(page.getByTestId('calendar-unlink-dialog')).toContainText(
          '取り込んだ予定は buddy に残ります。',
        )
        await page.getByTestId('calendar-unlink-submit').click()
        await expect(remove).toBeHidden()
      }
    })

    test('Google カレンダーで直された予定を buddy で変えた場合、確かめが要る予定に出て、書き直すと Google カレンダーが buddy の内容になること', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const created = `E2E の書き出し ${stamp}`
      const changed = `E2E の書き出し（buddy で変更）${stamp}`
      let eventId = ''
      let scheduleId = ''

      await test.step('林に Google カレンダーを結び付ける', async () => {
        await linkHayashi(page)
      })

      await test.step('buddy で林の予定を作ると、林の Google カレンダーに同じタイトルで出る', async () => {
        eventId = await createHayashiSchedule(page, request, created)
      })

      await test.step('職員が Google カレンダーで予定を直した後に buddy で変えると、確かめが要る予定に出る', async () => {
        // 予定の API が Google の変更を先に読んで buddy に当てないよう、中継に変更を渡させない
        await holdGoogleChanges(request, true)
        await shiftGoogleEvent(request, HAYASHI.calendarId, eventId)
        scheduleId = await renameHayashiSchedule(page, created, changed)

        await openReviewUntilRow(page, scheduleId)
        await expect(
          reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/),
        ).toHaveText(
          'buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。',
        )
        await holdGoogleChanges(request, false)
        // 一覧は Google カレンダーのタイトルを出さない
        await expect(page.getByTestId('calendar-review-table')).not.toContainText(created)
        await expect(page.getByTestId('calendar-review-table')).not.toContainText(changed)
        expect((await findEvent(request, created))?.status).toBe('confirmed')
      })

      await test.step('buddy の内容で書き直すと、一覧から消え、Google カレンダーが buddy のタイトルになる', async () => {
        await rewriteRow(page, scheduleId, 'Google カレンダーで直したタイトルと日時は消えます。')

        await expect.poll(async () => (await findEvent(request, changed))?.id).toBe(eventId)
      })
    })

    test('Google カレンダーで消された予定を buddy で変えた場合、確かめが要る予定に見つからないと出て、書き直すと Google カレンダーに戻ること', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const created = `E2E の書き出し（Google で削除）${stamp}`
      const changed = `E2E の書き出し（Google で削除、buddy で変更）${stamp}`
      let eventId = ''
      let scheduleId = ''

      await test.step('林に Google カレンダーを結び付け、buddy で作った予定を Google カレンダーに出す', async () => {
        await linkHayashi(page)
        eventId = await createHayashiSchedule(page, request, created)
      })

      await test.step('職員が Google カレンダーで予定を消した後に buddy で変えると、確かめが要る予定に見つからないと出る', async () => {
        // 予定の API が Google の削除を先に読んで buddy の予定をキャンセルしないよう、中継に変更を渡させない
        await holdGoogleChanges(request, true)
        await deleteGoogleEvent(request, HAYASHI.calendarId, eventId)
        scheduleId = await renameHayashiSchedule(page, created, changed)

        await openReviewUntilRow(page, scheduleId)
        await expect(
          reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/),
        ).toHaveText(
          'Google カレンダーで予定が見つかりません。予定が消されたか、カレンダーの共有が外れていないかを、職員に確かめてください。',
        )
        await holdGoogleChanges(request, false)
      })

      await test.step('buddy の内容で書き直すと、一覧から消え、Google カレンダーに buddy のタイトルで予定が戻る', async () => {
        await rewriteRow(page, scheduleId, '消された予定は作り直します。')

        await expect
          .poll(async () => {
            const event = await findEvent(request, changed)
            return [event?.id, event?.status]
          })
          .toEqual([eventId, 'confirmed'])
      })
    })
  })
})
