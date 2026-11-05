import { expect, test, type Page } from '@playwright/test'

import { OKADA, OKADA_STATE } from '../../fixtures/env'
import { createGoogleEvent, failGoogleReads } from '../../fixtures/googleCalendar'
import { detailDateTimeText } from '../../fixtures/schedule'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。Projection は今日の前後の予定を持つので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 日の表示を date で開き、岡田の列が出るまで待つ。 */
const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${OKADA.staff.id}`)).toBeVisible()
}

// シードの 3 つ目の事業所は Google カレンダーを予定の正本にする（google_primary）。同期の Worker が岡田のカレンダーの予定を
// Projection に写し、予定のカレンダーは Projection を読む（ADR-0029）。
test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーを正本にする事業所', () => {
    test.use({ storageState: OKADA_STATE })

    test('Google カレンダーに予定を作った場合、手動の取り込みをせずに予定のカレンダーに出て、詳細に変更の操作が出ないこと', async ({
      page,
      request,
    }) => {
      const date = todayInTokyo()
      const title = `E2E の Google の予定 ${Date.now()}`
      await createGoogleEvent(request, OKADA.calendarId, {
        summary: title,
        date,
        start: '06:00',
        end: '07:00',
      })

      await openDay(page, date)
      const event = page
        .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: title })
      // 同期の Worker が予定を Projection に写すまで、画面を開き直す
      await expect(async () => {
        await page.reload()
        await expect(event).toBeVisible()
      }).toPass()

      await event.click()
      const detail = page.getByTestId('schedule-detail-modal')
      await expect(detail).toContainText(title)
      await expect(detail.getByTestId('schedule-detail-datetime')).toHaveText(
        detailDateTimeText(date, '06:00', '07:00'),
      )
      await expect(detail.getByTestId('schedule-detail-google-calendar')).toBeVisible()
      await expect(detail.getByTestId('schedule-detail-edit')).toHaveCount(0)
    })

    test('予定のカレンダーを開いた場合、予定の作成の操作が出ず、Google カレンダーで編集する案内が出ること', async ({
      page,
    }) => {
      await openDay(page, todayInTokyo())
      // 案内が出たことで、事業所のモードを読んで描き終えたとみなしてから、作成の操作が無いことを確認する
      await expect(page.getByTestId('schedule-calendar-google-primary')).toContainText(
        '予定は Google カレンダーで管理しています',
      )
      await expect(page.getByTestId('schedule-create-open')).toHaveCount(0)
    })

    test.describe('同期の失敗', () => {
      test.afterEach(async ({ request }) => {
        await failGoogleReads(request, OKADA.calendarId, false)
      })

      test('Google カレンダーを読めずに同期が失敗している場合、予定が最新でないことを示し、同期が直ると示さなくなること', async ({
        page,
        request,
      }) => {
        const warning = page.getByTestId(
          `schedule-calendar-sync-warning-${OKADA.externalCalendarId}`,
        )
        await failGoogleReads(request, OKADA.calendarId, true)
        await openDay(page, todayInTokyo())
        // 同期の Worker が失敗を書くまで、画面を開き直す
        await expect(async () => {
          await page.reload()
          await expect(warning).toContainText('同期に失敗しています')
        }).toPass()
        await expect(page.getByTestId('schedule-calendar-sync-warning')).toContainText(
          '予定が最新でない可能性があります',
        )

        await failGoogleReads(request, OKADA.calendarId, false)
        await expect(async () => {
          await page.reload()
          await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
          await expect(warning).toHaveCount(0)
        }).toPass()
      })
    })
  })
})
