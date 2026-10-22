import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

// 表示の期間と今の時刻の線の位置を毎回同じにするため、ブラウザの時計を 2026/10/21（水）10:15 から進める
const NOW = new Date(2026, 9, 21, 10, 15)

test.describe('予定のカレンダー', () => {
  test.describe('表示の期間の見出しと今の時刻の線', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}次へと表示の単位を操作した場合、見出しが表示の期間に合わせて変わること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-schedule-schedulecalendarcontainer--month')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-calendar-title',
            title: '予定のカレンダーで、次へと表示の単位を操作し、表示の期間の見出しを見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await page.goto(url)
            await expect(page.getByTestId('calendar-next')).toBeVisible()
            const title = page.getByTestId('calendar-title')
            await step(
              '予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を、2026/10/21 として開いている',
            )
            if (isBefore) {
              await expect(title).toHaveCount(0)
              await check('ツールバーに表示の期間の見出しが無く、日付は入力欄でだけ分かる')
              return
            }
            await expect(title).toHaveText('2026年10月')
            await check('見出しが「2026年10月」になる')

            await step('「次へ」を押す')
            await page.getByTestId('calendar-next').click()
            await expect(title).toHaveText('2026年11月')
            await check('見出しが「2026年11月」に変わる')

            await step('表示の単位で「週」を選ぶ')
            await page.getByTestId('calendar-view-week').check()
            await expect(title).toHaveText('2026年11月1日〜7日')
            await check('見出しが日曜から土曜の「2026年11月1日〜7日」に変わる')

            await step('表示の単位で「日」を選ぶ')
            await page.getByTestId('calendar-view-day').check()
            await expect(title).toHaveText('2026年11月1日（日）')
            await check('見出しが日付と曜日の「2026年11月1日（日）」に変わる')
          },
        )
      })

      test(`${prefix}今日の日の表示を開いた場合、全ての職員の列の今の時刻の位置に横線が出ること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-schedule-schedulecalendarcontainer--day')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-calendar-now-line',
            title: '予定のカレンダーの日の表示を今日で開き、今の時刻の線を見る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await page.goto(url)
            const grid = page.getByTestId('staff-schedule-day-grid')
            await expect(grid).toBeVisible()
            await step(
              '予定のカレンダーの日の表示（Storybook の ScheduleCalendarContainer の Day）を、今日の 2026/10/21 10:15 として開いている',
            )
            const lines = page.getByTestId(/^day-grid-now-/)
            if (isBefore) {
              await expect(lines).toHaveCount(0)
              await check('今の時刻の線が無く、時刻は左の目盛りから読み取る')
              return
            }
            await expect(lines.first()).toBeVisible()
            await lines.first().scrollIntoViewIfNeeded()
            await check('全ての職員の列の 10:15 の位置に、主の色の横線が出る')
          },
        )
      })
    }
  })
})
