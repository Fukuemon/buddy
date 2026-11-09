import { expect, test, type Page } from '@playwright/test'

import { CALENDARPIT_URL, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  failGoogleReads,
} from '../../fixtures/googleCalendar'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, OKADA.email)
}

const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${OKADA.staff.id}`)).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーを正本にする事業所', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''

      test(`${label}Google カレンダーに予定を作った場合、同期の後に手動の取り込みをせずに予定のカレンダーに出ること`, async ({
        browser,
      }) => {
        const date = todayInTokyo()
        const title = `担当者会議 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-synced-event',
            title:
              'Google カレンダーに作った予定が、同期の後に手動の取り込みをせずに予定のカレンダーに出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${date}`,
            )
            await step(`${OKADA.staff.name} の Google カレンダー（calendarpit）を開いている`)
            await step(
              `（撮影のため、職員が Google カレンダーで予定を作る代わりに、calendarpit の管理の API で今日の 14:00〜15:00 に「${title}」を作る）`,
            )
            await createGoogleEvent(page.request, OKADA.calendarId, {
              summary: title,
              date,
              start: '14:00',
              end: '15:00',
            })
            await page.reload()
            await expect(calendarpitEvent(page, title)).toBeVisible()
            await check(`calendarpit に「${title}」が出る`)

            await step('buddy の予定のカレンダーを日の表示で開く（取り込みの画面は開かない）')
            await openDay(page, date)
            const event = page
              .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: title })
            await expect(async () => {
              await page.reload()
              await expect(event).toBeVisible()
            }).toPass()
            await event.scrollIntoViewIfNeeded()
            await check(`同期の後に、${OKADA.staff.name} の列の 14:00〜15:00 に「${title}」が出る`)

            await step('予定を押して詳細を開く')
            await event.click()
            const detail = page.getByTestId('schedule-detail-modal')
            await expect(detail.getByTestId('schedule-detail-google-calendar')).toBeVisible()
            await expect(detail.getByTestId('schedule-detail-edit')).toHaveCount(0)
            await check('詳細に Google カレンダーで変更する案内が出て、「編集」のボタンが出ない')
          },
        )
      })

      test(`${label}Google カレンダーで予定を取り消した場合、同期の後に予定のカレンダーから消えること`, async ({
        browser,
      }) => {
        const date = todayInTokyo()
        const title = `カンファレンス ${Date.now()}`
        const event = (page: Page) =>
          page
            .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
            .getByTestId(/^schedule-event-/)
            .filter({ hasText: title })
        let eventId = ''
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-cancelled-event',
            title: 'Google カレンダーで取り消した予定が、同期の後に予定のカレンダーから消える',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signIn(page)
            eventId = (
              await createGoogleEvent(page.request, OKADA.calendarId, {
                summary: title,
                date,
                start: '10:00',
                end: '11:00',
              })
            ).id
            await openDay(page, date)
            await expect(async () => {
              await page.reload()
              await expect(event(page)).toBeVisible()
            }).toPass()
          },
          async ({ page, step, check }) => {
            await openDay(page, date)
            await expect(event(page)).toBeVisible()
            await event(page).scrollIntoViewIfNeeded()
            await step(
              `予定のカレンダーを日の表示で開いている。${OKADA.staff.name} の列の 10:00〜11:00 に、Google カレンダーで作った「${title}」が出ている`,
            )

            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${date}`,
            )
            await expect(calendarpitEvent(page, title)).toBeVisible()
            await step(
              `（撮影のため、職員が Google カレンダーで予定を取り消す代わりに、calendarpit の管理の API で「${title}」を消す）`,
            )
            await deleteGoogleEvent(page.request, OKADA.calendarId, eventId)
            await page.reload()
            await expect(calendarpitEvent(page, title)).toHaveCount(0)
            await check(`calendarpit から「${title}」が消える`)

            await step('buddy の予定のカレンダーを日の表示で開き直す')
            await openDay(page, date)
            await expect(async () => {
              await page.reload()
              await expect(event(page)).toHaveCount(0)
            }).toPass()
            await check(`同期の後に、${OKADA.staff.name} の列から「${title}」が消える`)
          },
        )
      })

      test(`${label}Google カレンダーを読めずに同期が失敗している場合、予定が最新でないことを示すこと`, async ({
        browser,
      }) => {
        const date = todayInTokyo()
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-sync-failed',
            title: '同期が失敗しているとき、予定のカレンダーが、予定が最新でないことを示す',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            const warning = page.getByTestId(
              `schedule-calendar-sync-warning-${OKADA.externalCalendarId}`,
            )
            try {
              await openDay(page, date)
              await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
              await expect(warning).toHaveCount(0)
              await step('同期が成功している間は、予定が最新でない警告が出ていない')

              await step(
                '（撮影のため、Google カレンダーに届かない代わりに、中継の gcalhold に岡田のカレンダーの予定の取得を 503 で失敗させる）',
              )
              await failGoogleReads(page.request, OKADA.calendarId, true)
              await step('予定のカレンダーを開き直す')
              await expect(async () => {
                await page.reload()
                await expect(warning).toContainText('同期に失敗しています')
              }).toPass()
              await expect(page.getByTestId('schedule-calendar-sync-warning')).toContainText(
                '予定が最新でない可能性があります',
              )
              await check(
                `「予定が最新でない可能性があります」と、${OKADA.staff.name} のカレンダーの同期に失敗していることと、最後に同期できた時刻が出る`,
              )

              await step('（撮影のため、gcalhold の失敗をやめる）予定のカレンダーを開き直す')
              await failGoogleReads(page.request, OKADA.calendarId, false)
              await expect(async () => {
                await page.reload()
                await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
                await expect(warning).toHaveCount(0)
              }).toPass()
              await check('同期が直ると、警告が消える')
            } finally {
              await failGoogleReads(page.request, OKADA.calendarId, false)
            }
          },
        )
      })

      test(`${label}Google カレンダーを正本にする事業所で予定のカレンダーを開いた場合、予定の作成と変更の操作が出ず、Google カレンダーで編集する案内が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-edit-guide',
            title:
              'Google カレンダーを正本にする事業所では、予定の作成と変更の操作が出ず、Google カレンダーで編集する案内が出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=week')
            await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
            await step('予定のカレンダーを週の表示で開く')
            await expect(page.getByTestId('schedule-calendar-google-primary')).toContainText(
              '予定は Google カレンダーで管理しています',
            )
            await expect(page.getByTestId('schedule-create-open')).toHaveCount(0)
            await check(
              '「予定は Google カレンダーで管理しています」の案内が出て、「予定を作成」のボタンが出ない',
            )

            await step('日の表示に切り替え、岡田の列の空いた時間の枠を押す')
            await openDay(page, todayInTokyo())
            await expect(page.getByTestId('schedule-create-open')).toHaveCount(0)
            await page
              .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
              .click({ position: { x: 40, y: 40 } })
            await expect(page.getByTestId('schedule-form-modal')).toHaveCount(0)
            await check('時間の枠を押しても、予定の作成のダイアログが開かない')
          },
        )
      })
    }
  })
})
