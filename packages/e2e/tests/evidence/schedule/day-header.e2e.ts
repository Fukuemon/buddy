import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  DESKTOP_VIEWPORT,
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  recordPrEvidence,
  storyUrl,
} from '../../fixtures/evidence'
import {
  CALENDAR_FRAME,
  calendarColumnHeaders,
  calendarDayNumbers,
  calendarTimeLabels,
} from '../../selectors/scheduleCalendar'

const ACTOR = 'ログインなし（Storybook の story）'

// 週の表示の期間を毎回同じ 2026/11/1（日）〜7（土）にするため、ブラウザの時計を 2026/11/2（月）10:00 から進める
const NOW = new Date('2026-11-02T10:00:00+09:00')
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const
/** 曜日と日の 2 行の見出しの文。2 行の間に空白が無いので「日1」になる */
const TWO_LINE_HEADERS = WEEKDAYS.map((weekday, index) => `${weekday}${index + 1}`)
const ONE_LINE_HEADERS = WEEKDAYS.map((weekday, index) => `11/${index + 1}(${weekday})`)

/**
 * 要素のうち、外側の枠（日のマス、時間の目盛りの列、職員の列）の左右からはみ出しているものの文を返す。
 * `ownContent` を真にすると、要素の中身が要素の幅からはみ出しているものも返す。
 * 予定の名前は省略の記号で切って隠すので、予定には `ownContent` を渡さず、外側の枠に収まるかだけを見る。
 */
const overflowingTexts = (elements: Locator, frame: string, ownContent = false) =>
  elements.evaluateAll(
    (nodes, [frameSelector, checkOwn]) =>
      nodes
        .filter((node) => {
          const box = node.getBoundingClientRect()
          const outer = node.closest(frameSelector)?.getBoundingClientRect()
          const overflowsOuter =
            outer !== undefined && (box.left < outer.left - 1 || box.right > outer.right + 1)
          return overflowsOuter || (checkOwn && node.scrollWidth > node.clientWidth + 1)
        })
        .map((node) => node.textContent ?? ''),
    [frame, ownContent] as const,
  )

const expectHeadersFit = async (page: Page) =>
  expect(
    await overflowingTexts(calendarColumnHeaders(page), '[role="columnheader"]', true),
  ).toEqual([])

test.describe('予定のカレンダー', () => {
  test.describe('週の表示の列の見出し', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}幅 390px で週の表示を開いた場合、列の見出しが曜日と日の 2 行で列の幅に収まること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-schedule-schedulepagelayout--week')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-day-header-phone',
            title: 'スマートフォンの幅で週の表示を開き、列の見出しを見る',
            actor: ACTOR,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await page.goto(url)
            await expect(page.getByTestId('schedule-calendar')).toBeVisible()
            await step(
              '幅 390px で、予定のカレンダーの週の表示（Storybook の SchedulePageLayout の Week）を、2026/11/2 として開いている',
            )
            await expect(calendarColumnHeaders(page)).toHaveText(TWO_LINE_HEADERS)
            await expectHeadersFit(page)
            await check(
              '列の見出しが「日」「1」から「土」「7」までの曜日と日の 2 行で出て、列の幅に収まる',
            )
          },
        )
      })

      test(`${prefix}幅 1280px で週の表示を開いた場合、列の見出しが「11/1(日)」の書式で出ること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-schedule-schedulepagelayout--week')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-day-header-desktop',
            title: 'PC の幅で週の表示を開き、列の見出しを見る',
            actor: ACTOR,
            variant,
            viewport: DESKTOP_VIEWPORT,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await page.goto(url)
            await expect(page.getByTestId('schedule-calendar')).toBeVisible()
            await step(
              '幅 1280px で、予定のカレンダーの週の表示（Storybook の SchedulePageLayout の Week）を、2026/11/2 として開いている',
            )
            await expect(calendarColumnHeaders(page)).toHaveText(ONE_LINE_HEADERS)
            await expectHeadersFit(page)
            await check('列の見出しが「11/1(日)」から「11/7(土)」の書式で出て、列の幅に収まる')
          },
        )
      })

      test(`${prefix}幅 390px で月の表示と日の表示を開いた場合、日のマス、時間の目盛り、予定の名前がマスや列からはみ出さないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-day-header-phone-month-day',
            title:
              'スマートフォンの幅で月、週、日の表示を開き、マス、時間の目盛り、予定の名前を見る',
            actor: ACTOR,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto(storyUrl('画面-schedule-schedulepagelayout--month'))
          },
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            const calendar = page.getByTestId('schedule-calendar')

            await page.goto(storyUrl('画面-schedule-schedulepagelayout--month'))
            await expect(calendar.getByTestId(/^schedule-event-/).first()).toBeVisible()
            await step(
              '幅 390px で、予定のカレンダーの月の表示（Storybook の SchedulePageLayout の Month）を、2026/11/2 として開いている',
            )
            expect(await overflowingTexts(calendarDayNumbers(page), CALENDAR_FRAME.day)).toEqual([])
            expect(
              await overflowingTexts(
                calendar.getByTestId(/^schedule-event-/),
                CALENDAR_FRAME.event,
              ),
            ).toEqual([])
            await check(
              '日のマスの日付と予定の名前が、マスと予定の中に収まる。長い名前は「…」で切れる',
            )

            await page.goto(storyUrl('画面-schedule-schedulepagelayout--week'))
            await expect(calendar.getByTestId(/^schedule-event-/).first()).toBeVisible()
            await step('週の表示（Storybook の SchedulePageLayout の Week）を開く')
            expect(
              await overflowingTexts(calendarTimeLabels(page), CALENDAR_FRAME.timeLabel, true),
            ).toEqual([])
            expect(
              await overflowingTexts(
                calendar.getByTestId(/^schedule-event-/),
                CALENDAR_FRAME.weekColumn,
              ),
            ).toEqual([])
            await check('時間の目盛りと予定のブロックが、列の中に収まる。予定の名前は「…」で切れる')

            await page.goto(storyUrl('画面-schedule-schedulepagelayout--day'))
            const grid = page.getByTestId('staff-schedule-day-grid')
            await expect(grid.getByTestId(/^schedule-event-/).first()).toBeVisible()
            await step('日の表示（Storybook の SchedulePageLayout の Day）を開く')
            expect(
              await overflowingTexts(
                grid.getByTestId(/^schedule-event-/),
                '[data-testid^="day-grid-staff-"]',
              ),
            ).toEqual([])
            await check(
              '時間の目盛りと予定のブロックが、職員の列の中に収まる。職員の列は横に送って見る',
            )
          },
        )
      })

      test(`${prefix}幅を 768px の前後で変えた場合、列の見出しの書式が切り替わり、どの幅でも列の幅に収まること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-schedule-schedulepagelayout--week')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-day-header-resize',
            title: '週の表示で幅を 767px、768px、1280px に変え、列の見出しを見る',
            actor: ACTOR,
            variant,
            viewport: DESKTOP_VIEWPORT,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await page.goto(url)
            await expect(page.getByTestId('schedule-calendar')).toBeVisible()
            await step(
              '幅 1280px で、予定のカレンダーの週の表示（Storybook の SchedulePageLayout の Week）を、2026/11/2 として開いている',
            )
            await expect(calendarColumnHeaders(page).first()).toHaveText('11/1(日)')
            await expectHeadersFit(page)
            await check('列の見出しが「11/1(日)」の書式で出る')

            await step('画面の幅を 767px にする')
            await page.setViewportSize({ width: 767, height: DESKTOP_VIEWPORT.height })
            await expect(calendarColumnHeaders(page)).toHaveText(TWO_LINE_HEADERS)
            await expectHeadersFit(page)
            await check('列の見出しが曜日と日の 2 行に切り替わり、列の幅に収まる')

            await step(
              '画面の幅を 768px にする\n左の欄が開いてカレンダーが狭くなるので、見出しは 2 行のままになる',
            )
            await page.setViewportSize({ width: 768, height: DESKTOP_VIEWPORT.height })
            await expect(page.getByTestId('mini-calendar')).toBeVisible()
            await expect(calendarColumnHeaders(page)).toHaveText(TWO_LINE_HEADERS)
            await expectHeadersFit(page)
            await check('左の欄が開き、列の見出しは 2 行のまま、列の幅に収まる')

            await step('画面の幅を 1280px に戻す')
            await page.setViewportSize(DESKTOP_VIEWPORT)
            await expect(calendarColumnHeaders(page)).toHaveText(ONE_LINE_HEADERS)
            await expect(calendarColumnHeaders(page).first()).toHaveText('11/1(日)')
            await expectHeadersFit(page)
            await check('列の見出しが「11/1(日)」の書式に戻り、列の幅に収まる')
          },
        )
      })
    }
  })
})
