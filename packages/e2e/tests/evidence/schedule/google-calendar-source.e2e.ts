import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, OKADA, OKADA_STATE } from '../../fixtures/env'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  failGoogleReads,
} from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { calendarpitEvent } from '../../selectors/calendarpit'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${OKADA.staff.id}`)).toBeVisible()
}

const openCalendarpit = (page: Page, date: string) =>
  page.goto(`${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${date}`)

/** 日の表示の岡田の列の、title の予定。 */
const okadaEvent = (page: Page, title: string) =>
  page
    .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

test.describe('予定のカレンダー', () => {
  test.describe(`予定を Google カレンダーで管理している事業所（${OKADA.staff.name}、予定を Google カレンダーで管理している事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('google-primary-synced-event Google カレンダーに予定を作った場合、同期の後に手動の取り込みをせずに予定のカレンダーに出ること', async ({
      page,
    }) => {
      const date = todayInTokyo()
      const title = `担当者会議 ${Date.now()}`
      await openCalendarpit(page, date)
      await intro(
        page,
        `Google カレンダーに作った予定が、同期の後に手動の取り込みをせずに予定のカレンダーに出る\n前提 ${OKADA.staff.name} の Google カレンダー（calendarpit）を開いている`,
      )

      await step(
        page,
        `（撮影のため、職員が Google カレンダーで予定を作る代わりに、calendarpit の管理の API で今日の 14:00〜15:00 に「${title}」を作る）`,
        async () => {
          await createGoogleEvent(page.request, OKADA.calendarId, {
            summary: title,
            date,
            start: '14:00',
            end: '15:00',
          })
          await page.reload()
        },
      )
      await check(page, `calendarpit に「${title}」が出る`, () =>
        expect(calendarpitEvent(page, title)).toBeVisible(),
      )

      const event = okadaEvent(page, title)
      await step(
        page,
        'buddy の予定のカレンダーを日の表示で開く（取り込みの画面は開かない）',
        async () => {
          await openDay(page, date)
          await expect(async () => {
            await page.reload()
            await expect(event).toBeVisible()
          }).toPass()
          await event.scrollIntoViewIfNeeded()
        },
      )
      await check(
        page,
        `同期の後に、${OKADA.staff.name} の列の 14:00〜15:00 に「${title}」が出る`,
        () => expect(event).toBeVisible(),
      )

      await step(page, '予定を押して詳細を開く', () => event.click())
      const detail = page.getByTestId('schedule-detail-modal')
      await check(
        page,
        '詳細に Google カレンダーで変更する案内が出て、「編集」のボタンが出ない',
        async () => {
          await expect(detail.getByTestId('schedule-detail-google-calendar')).toBeVisible()
          await expect(detail.getByTestId('schedule-detail-edit')).toHaveCount(0)
        },
      )
    })

    test('google-primary-cancelled-event Google カレンダーで予定を取り消した場合、同期の後に予定のカレンダーから消えること', async ({
      browser,
      context,
    }) => {
      const date = todayInTokyo()
      const title = `カンファレンス ${Date.now()}`
      const eventId = await prepareOutsideRecording(
        browser,
        { storageState: OKADA_STATE },
        async (page) => {
          const { id } = await createGoogleEvent(page.request, OKADA.calendarId, {
            summary: title,
            date,
            start: '10:00',
            end: '11:00',
          })
          await openDay(page, date)
          await expect(async () => {
            await page.reload()
            await expect(okadaEvent(page, title)).toBeVisible()
          }).toPass()
          return id
        },
      )

      const page = await context.newPage()
      const event = okadaEvent(page, title)
      await openDay(page, date)
      await expect(event).toBeVisible()
      await event.scrollIntoViewIfNeeded()
      await intro(
        page,
        `Google カレンダーで取り消した予定が、同期の後に予定のカレンダーから消える\n前提 予定のカレンダーを日の表示で開いている。${OKADA.staff.name} の列の 10:00〜11:00 に、Google カレンダーで作った「${title}」が出ている`,
      )

      await step(
        page,
        `（撮影のため、職員が Google カレンダーで予定を取り消す代わりに、calendarpit の管理の API で「${title}」を消す）`,
        async () => {
          await openCalendarpit(page, date)
          await expect(calendarpitEvent(page, title)).toBeVisible()
          await deleteGoogleEvent(page.request, OKADA.calendarId, eventId)
          await page.reload()
        },
      )
      await check(page, `calendarpit から「${title}」が消える`, () =>
        expect(calendarpitEvent(page, title)).toHaveCount(0),
      )

      await step(page, 'buddy の予定のカレンダーを日の表示で開き直す', () => openDay(page, date))
      await check(page, `同期の後に、${OKADA.staff.name} の列から「${title}」が消える`, () =>
        expect(async () => {
          await page.reload()
          await expect(event).toHaveCount(0)
        }).toPass(),
      )
    })

    test('google-primary-sync-failed Google カレンダーを読めずに同期が失敗している場合、予定が最新でないことを示すこと', async ({
      page,
    }) => {
      const date = todayInTokyo()
      const warning = page.getByTestId(`schedule-calendar-sync-warning-${OKADA.externalCalendarId}`)
      try {
        await openDay(page, date)
        await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
        await expect(warning).toHaveCount(0)
        await intro(
          page,
          '同期が失敗しているとき、予定のカレンダーが、予定が最新でないことを示す\n前提 同期が成功している間は、予定が最新でない警告が出ていない',
        )

        await step(
          page,
          '（撮影のため、Google カレンダーに届かない代わりに、中継の gcalhold に岡田のカレンダーの予定の取得を 503 で失敗させる）予定のカレンダーを開き直す',
          async () => {
            await failGoogleReads(page.request, OKADA.calendarId, true)
            await expect(async () => {
              await page.reload()
              await expect(warning).toContainText('同期に失敗しています')
            }).toPass()
          },
        )
        await check(
          page,
          `「予定が最新でない可能性があります」と、${OKADA.staff.name} のカレンダーの同期に失敗していることと、最後に同期できた時刻が出る`,
          async () => {
            await expect(warning).toContainText('同期に失敗しています')
            await expect(page.getByTestId('schedule-calendar-sync-warning')).toContainText(
              '予定が最新でない可能性があります',
            )
          },
        )

        await step(
          page,
          '（撮影のため、gcalhold の失敗をやめる）予定のカレンダーを開き直す',
          async () => {
            await failGoogleReads(page.request, OKADA.calendarId, false)
            await expect(async () => {
              await page.reload()
              await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
              await expect(warning).toHaveCount(0)
            }).toPass()
          },
        )
        await check(page, '同期が直ると、警告が消える', () => expect(warning).toHaveCount(0))
      } finally {
        await failGoogleReads(page.request, OKADA.calendarId, false)
      }
    })

    test('google-primary-create-guide 予定を Google カレンダーで管理している事業所で予定のカレンダーを開いた場合、予定の作成の操作と、buddy と Google カレンダーのどちらでも作成、変更できる案内が出ること', async ({
      page,
    }) => {
      const notice = page.getByTestId('schedule-calendar-google-primary')
      await page.goto('/schedule?view=week')
      await expect(notice).toBeVisible()
      await intro(
        page,
        '予定を Google カレンダーで管理している事業所でも、予定の作成の操作が出て、buddy と Google カレンダーのどちらでも作成、変更できる案内が出る\n前提 予定のカレンダーを週の表示で開いている',
      )

      await check(
        page,
        '「予定は Google カレンダーと同期しています」の見出しと、「Google カレンダーと buddy のどちらでも作成、変更できます」の本文が出て、「予定を作成」のボタンが出る',
        async () => {
          await expect(notice).toContainText('予定は Google カレンダーと同期しています')
          await expect(notice).toContainText(
            'Google カレンダーと buddy のどちらでも作成、変更できます',
          )
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
        },
      )

      // 8 時の枠は、日の表示を開いたときに見えていて、ほかの spec が岡田のカレンダーに今日の予定を作らない時刻である
      await step(
        page,
        `日の表示に切り替え、${OKADA.staff.name} の列の 8:00 の枠を押す`,
        async () => {
          await openDay(page, todayInTokyo())
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
          await page.getByTestId(`day-grid-slot-${OKADA.staff.id}-08:00`).click()
        },
      )
      await check(page, '時間の枠を押すと、予定の作成のダイアログが開く', () =>
        expect(page.getByTestId('schedule-form-modal')).toBeVisible(),
      )
    })
  })
})
