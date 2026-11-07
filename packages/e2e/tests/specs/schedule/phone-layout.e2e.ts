import { expect, test } from '@playwright/test'

import { LOGIN_STAFF, OFFICE_A_SCHEDULE } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/evidence'

/** シードのカンファレンスの翌日。週の一覧の見出しを押して移る先にする。 */
const NEXT_DAY = '2026-10-21'

test.describe('予定のカレンダー', () => {
  test.describe('幅 390px の表示', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('表示の単位を指定せずに開いた場合、日の表示で始まること', async ({ page }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('staff-schedule-day-grid')).toBeVisible()
      await expect(page.getByTestId('calendar-view-day')).toBeChecked()
    })

    test('「月」を選んだ場合、月の表示になり URL に view=month が付くこと', async ({ page }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('staff-schedule-day-grid')).toBeVisible()

      await page.getByTestId('calendar-view-month').check()

      await expect(page.getByTestId('schedule-calendar')).toBeVisible()
      await expect(page).toHaveURL(/[?&]view=month(&|$)/)
    })

    test('週の表示を開いた場合、時刻の格子の代わりに、時刻、タイトル、職員の名前の行が並ぶ週の一覧が出ること', async ({
      page,
    }) => {
      await page.goto(`/schedule?view=week&date=${OFFICE_A_SCHEDULE.date}`)

      const agenda = page.getByTestId('schedule-agenda')
      await expect(agenda).toBeVisible()
      await expect(page.getByTestId('schedule-calendar')).toBeHidden()
      const row = agenda
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: OFFICE_A_SCHEDULE.title })
      await expect(row).toContainText('10:00 - 11:00')
      await expect(row).toContainText(LOGIN_STAFF.name)
    })

    test('週の一覧の日の見出しを押した場合、その日の日の表示に移ること', async ({ page }) => {
      await page.goto(`/schedule?view=week&date=${OFFICE_A_SCHEDULE.date}`)

      await page.getByTestId(`schedule-agenda-day-${NEXT_DAY}`).click()

      await expect(page.getByTestId('staff-schedule-day-grid')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`[?&]date=${NEXT_DAY}(&|$)`))
      await expect(page.getByTestId('calendar-view-day')).toBeChecked()
    })

    test('週の一覧の予定の行を押した場合、予定の詳細が開くこと', async ({ page }) => {
      await page.goto(`/schedule?view=week&date=${OFFICE_A_SCHEDULE.date}`)

      await page
        .getByTestId('schedule-agenda')
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: OFFICE_A_SCHEDULE.title })
        .click()

      await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
    })

    test('日の表示で職員の列を横に送った場合、時刻の列が画面に残ること', async ({ page }) => {
      await page.goto(`/schedule?view=day&date=${OFFICE_A_SCHEDULE.date}`)
      const grid = page.getByTestId('staff-schedule-day-grid')
      // 4 人の職員の列は幅 390px に入らないので、横に送れる。送る前に列が並んだことを確かめる
      await expect(grid.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()

      await grid.evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })

      await expect(grid.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).not.toBeInViewport()
      await expect(grid.getByTestId('day-grid-times')).toBeInViewport()
    })
  })
})
