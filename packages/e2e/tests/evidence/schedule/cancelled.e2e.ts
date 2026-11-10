import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const DAY_URL = storyUrl('画面-schedule-schedulepagelayout--day')
const DAY_WITH_CANCELLED_URL = storyUrl('画面-schedule-schedulepagelayout--day-with-cancelled')
const DETAIL_URL = storyUrl('画面-schedule-scheduledetailmodalcontainer--cancelled')

const openDay = async (page: Page, url: string) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-schedule-day-grid')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('キャンセルした予定の表示（ログインなし、Storybook の story）', () => {
    test('schedule-cancelled-toggle 切り替えを入れた場合、キャンセルした予定が取り消し線と「キャンセル」の印で出ること', async ({
      page,
    }) => {
      await openDay(page, DAY_URL)
      await intro(
        page,
        '日の表示で「キャンセルした予定を出す」を入れ、キャンセルした予定を見る\n前提 予定のカレンダーの日の表示（Storybook の SchedulePageLayout の Day）を開いている。江藤 四郎の 11:00 の訪問はキャンセルした予定である（架空のデータ）',
      )

      const cancelled = page.getByTestId('schedule-event-schedule-6')
      await check(page, '切り替えが外れている間は、キャンセルした予定が出ない', async () => {
        // 予定が描かれてから、キャンセルした予定が無いことを確認する
        await expect(page.getByTestId('schedule-event-schedule-1')).toBeVisible()
        await expect(page.getByTestId('calendar-show-cancelled')).not.toBeChecked()
        await expect(cancelled).toHaveCount(0)
      })

      await step(page, '左のサイドバーの「キャンセルした予定を出す」を入れる', () =>
        page.getByTestId('calendar-show-cancelled').check(),
      )
      await check(
        page,
        '江藤 四郎の列に、薄い灰色の面に取り消し線を付けた予定が出て、「キャンセル」の文字は出ない',
        async () => {
          await expect(cancelled).toBeVisible()
          // 「キャンセル」は読み上げの文にだけ残し、画面には出さない
          await expect(cancelled).toContainText('キャンセル、')
          await expect(page.getByTestId('schedule-event-schedule-6-cancelled')).toHaveCSS(
            'text-decoration-line',
            'line-through',
          )
        },
      )
    })

    test('schedule-cancelled-url URL で切り替えを入れて開いた場合、キャンセルした予定が出ること', async ({
      page,
    }) => {
      await openDay(page, DAY_WITH_CANCELLED_URL)
      await intro(
        page,
        'URL の cancelled=true で日の表示を開く（再読み込みしたときと同じ）\n前提 `/schedule?view=day&cancelled=true` を開いている（Storybook の SchedulePageLayout の DayWithCancelled）',
      )

      await check(page, '切り替えが入った状態で開き、キャンセルした予定が出る', async () => {
        await expect(page.getByTestId('calendar-show-cancelled')).toBeChecked()
        await expect(page.getByTestId('schedule-event-schedule-6')).toBeVisible()
      })
    })
  })
})

test.describe('予定の詳細', () => {
  test.describe('キャンセルした予定の詳細（ログインなし、Storybook の story）', () => {
    test('schedule-cancelled-detail キャンセルした予定の詳細を開いた場合、キャンセルの理由が出て、編集のボタンが出ないこと', async ({
      page,
    }) => {
      await page.goto(DETAIL_URL)
      await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
      await intro(
        page,
        'キャンセルした予定の詳細を開く\n前提 キャンセルした訪問の予定の詳細（Storybook の ScheduleDetailModalContainer の Cancelled。予定を取ってから出す）を開いている',
      )

      await check(
        page,
        '先頭に「キャンセルした予定です。理由: 利用者の体調不良」が出て、編集のボタンが無い',
        async () => {
          await expect(page.getByTestId('schedule-detail-cancel')).toHaveText(
            'キャンセルした予定です。理由: 利用者の体調不良',
          )
          await expect(page.getByTestId('schedule-detail-edit')).toHaveCount(0)
        },
      )
    })
  })
})
