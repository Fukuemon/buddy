import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { calendarTimeLabel, calendarWeekColumns } from '../../selectors/scheduleCalendar'

/** 開く週の日曜と、押す日（火曜）。ほかの spec で作った予定と重ならない週にする。ほかの spec が残す終わりの無い繰り返しの予定は 9 時より前に入らないので、8 時の枠を押す。 */
const WEEK_START = '2026-12-20'
const CLICK_DATE = '2026-12-22'

test.describe('予定のカレンダー', () => {
  test.describe(`週の表示からの予定の作成（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-week-slot-create 週の表示で空いた時間を押した場合、その日と時刻を入れた予定の作成のダイアログが開くこと', async ({
      page,
    }) => {
      await page.goto(`/schedule?view=week&date=${WEEK_START}`)
      const label = calendarTimeLabel(page, '08:00:00')
      await label.scrollIntoViewIfNeeded()
      await expect(label).toBeInViewport()
      await intro(
        page,
        '週の表示で空いた時間を押すと、その日と時刻を入れた予定の作成のダイアログが開く\n前提 週の表示で、2026年12月20日（日）から 26日（土）の週を開いている',
      )

      await step(page, '12月22日（火）の 8 時の枠を押す', async () => {
        // 週の表示の日の列は日曜から並ぶので、火曜は 3 列目である。8 時の見出しの高さの少し下を押す
        const column = await calendarWeekColumns(page).nth(2).boundingBox()
        const row = await label.boundingBox()
        if (column === null || row === null) throw new Error('週の表示の列か時刻の見出しが無い')
        await page.mouse.click(column.x + column.width / 2, row.y + 10)
      })
      await check(
        page,
        `予定の作成のダイアログが開き、日時に ${CLICK_DATE} の 08:00 が入る`,
        async () => {
          await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
          const dateTime = page.getByTestId('schedule-field-date-time')
          await expect(dateTime).toContainText(CLICK_DATE)
          await expect(dateTime).toContainText('08:00')
        },
      )
    })
  })
})
