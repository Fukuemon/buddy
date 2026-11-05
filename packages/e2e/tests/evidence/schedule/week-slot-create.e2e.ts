import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { calendarTimeLabel, calendarWeekColumns } from '../../selectors/scheduleCalendar'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

/** 開く週の日曜と、押す日（火曜）。ほかの spec で作った予定と重ならない週にする。 */
const WEEK_START = '2026-12-20'
const CLICK_DATE = '2026-12-22'

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

test.describe('予定のカレンダー', () => {
  test.describe('週の表示からの予定の作成', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}週の表示で空いた時間を押した場合、その日と時刻を入れた予定の作成のダイアログが開くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-week-slot-create',
            title: '週の表示で空いた時間を押すと、その日と時刻を入れた予定の作成のダイアログが開く',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto(`/schedule?view=week&date=${WEEK_START}`)
            const label = calendarTimeLabel(page, '10:00:00')
            await label.scrollIntoViewIfNeeded()
            await expect(label).toBeInViewport()
            await step('週の表示で、2026年12月20日（日）から 26日（土）の週を開いている')

            await step('12月22日（火）の 10 時の枠を押す')
            // 週の表示の日の列は日曜から並ぶので、火曜は 3 列目である。10 時の見出しの高さの少し下を押す
            const column = await calendarWeekColumns(page).nth(2).boundingBox()
            const row = await label.boundingBox()
            if (column === null || row === null) throw new Error('週の表示の列か時刻の見出しが無い')
            await page.mouse.click(column.x + column.width / 2, row.y + 10)

            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
            const dateTime = page.getByTestId('schedule-field-date-time')
            await expect(dateTime).toContainText(CLICK_DATE)
            await expect(dateTime).toContainText('10:00')
            await check(`予定の作成のダイアログが開き、日時に ${CLICK_DATE} の 10:00 が入る`)
          },
        )
      })
    }
  })
})
