import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

// 表示の期間と今の時刻の線の位置を毎回同じにするため、ブラウザの時計を 2026/10/21（水）10:15 から進める。
// ブラウザは Asia/Tokyo で動くので、spec を流す環境の時間帯によらないよう時差を付けて書く
const NOW = new Date('2026-10-21T10:15:00+09:00')
const STORY_STAFF_COUNT = 4

test.describe('予定のカレンダー', () => {
  test.describe('表示の期間の見出しと今の時刻の線（ログインなし、Storybook の story）', () => {
    test('schedule-calendar-title 次へと表示の単位を操作した場合、見出しが表示の期間に合わせて変わること', async ({
      page,
    }) => {
      await page.clock.install({ time: NOW })
      await page.goto(storyUrl('画面-schedule-schedulecalendarcontainer--month'))
      await expect(page.getByTestId('calendar-next')).toBeVisible()
      const title = page.getByTestId('calendar-title')
      await intro(
        page,
        '予定のカレンダーで、次へと表示の単位を操作し、表示の期間の見出しを見る\n前提 予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を、2026/10/21 として開いている',
      )

      await check(page, '見出しが「2026年10月」になる', () =>
        expect(title).toHaveText('2026年10月'),
      )

      await step(page, '「次へ」を押す', () => page.getByTestId('calendar-next').click())
      await check(page, '見出しが「2026年11月」に変わる', () =>
        expect(title).toHaveText('2026年11月'),
      )

      await step(page, '表示の単位で「週」を選ぶ', () =>
        page.getByTestId('calendar-view-week').check(),
      )
      await check(page, '見出しが日曜から土曜の「2026年11月1日〜7日」に変わる', () =>
        expect(title).toHaveText('2026年11月1日〜7日'),
      )

      await step(page, '表示の単位で「日」を選ぶ', () =>
        page.getByTestId('calendar-view-day').check(),
      )
      await check(page, '見出しが日付と曜日の「2026年11月1日（日）」に変わる', () =>
        expect(title).toHaveText('2026年11月1日（日）'),
      )
    })

    test('schedule-calendar-now-line 今日の日の表示を開いた場合、全ての職員の列の今の時刻の位置に横線が出ること', async ({
      page,
    }) => {
      await page.clock.install({ time: NOW })
      await page.goto(storyUrl('画面-schedule-schedulecalendarcontainer--day'))
      await expect(page.getByTestId('staff-schedule-day-grid')).toBeVisible()
      await intro(
        page,
        '予定のカレンダーの日の表示を今日で開き、今の時刻の線を見る\n前提 予定のカレンダーの日の表示（Storybook の ScheduleCalendarContainer の Day）を、今日の 2026/10/21 10:15 として開いている',
      )

      const lines = page.getByTestId(/^day-grid-now-/)
      // 線の位置は StaffScheduleDayGrid.test.tsx で確認し、ここでは全ての列に出ることを見る
      await expect(lines).toHaveCount(STORY_STAFF_COUNT)
      // 送る操作には止めが入らず、step の字幕が読めないので、送る字幕を判定の字幕の 1 行目に書く
      await lines.first().scrollIntoViewIfNeeded()
      await check(
        page,
        '（撮影のため、今の時刻の線が見える位置まで送る）\n全ての職員の列の 10:15 の位置に、主の色の横線が出る',
        () => expect(lines).toHaveCount(STORY_STAFF_COUNT),
      )
    })
  })
})
