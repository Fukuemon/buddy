import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { addDays, dayLabel, sundayOfWeek } from '../../fixtures/date'
import { OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  breakGoogleEventEnd,
  createGoogleEvent,
  createGoogleOccurrenceException,
  deleteGoogleEvent,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { detailDateTimeText, SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { signInAtBroker } from '../../screens/login'
import { calendarAllDayRowLabel, calendarTimeLabel } from '../../selectors/scheduleCalendar'

const ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

/**
 * 予定のタイトルの後ろに付ける、今の時刻のミリ秒の下 3 桁。走らせるたびに違うタイトルにする。
 * 週の表示の列は狭く、長いタイトルは末尾が切れるので、時刻の全ての桁は付けない。
 */
const stamp = () => String(Date.now()).slice(-3)

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, OKADA.email)
}

const openWeek = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=week&date=${date}`)
  await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
}

/** 週の表示の時刻の格子の、タイトルが title の時刻のある予定。 */
const timedEvent = (page: Page, title: string) =>
  page
    .getByTestId('schedule-calendar')
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

/** 通知の欄の、カレンダーに出せない予定の通知。 */
const unlistedNotice = (page: Page) => page.getByTestId('schedule-calendar-unlisted')

/** 同期が、出せない予定を写して件数の通知が出るまで、週の表示を開き直す。 */
const waitUnlistedSynced = async (page: Page, date: string) => {
  await openWeek(page, date)
  await expect(async () => {
    await page.reload()
    await expect(unlistedNotice(page)).toBeVisible()
  }).toPass()
}

/** 件数の通知が、岡田の出せない予定を 1 件と出していることを確認する。 */
const expectOneUnlisted = async (page: Page) => {
  await expect(unlistedNotice(page)).toContainText('カレンダーに出せない予定が 1 件あります')
  await expect(page.getByTestId(`schedule-calendar-unlisted-${OKADA.staff.id}`)).toHaveText(
    `${OKADA.staff.name}: 1 件`,
  )
  await expect(unlistedNotice(page)).toContainText('Google カレンダーで確認してください')
}

/** test で作った Google カレンダーの予定を消す。消した予定が、ほかの観点の件数に残らないようにする。 */
const deleteEvents = async (request: APIRequestContext, ids: string[]) => {
  for (const id of ids) await deleteGoogleEvent(request, OKADA.calendarId, id)
}

test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーのカレンダーに出せない予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''

      test(`${label}表示している週に時刻を読めない予定がある場合、通知の欄に件数と Google カレンダーで確認する案内が出て、格子には出ないこと`, async ({
        browser,
        request,
      }) => {
        const date = addDays(sundayOfWeek(6), 3)
        const title = `訪問調整 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'unlisted-time',
              title: '時刻を読めない予定の件数と案内',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              // 予定の ID は作るまで分からないので、作る前にタイトルで壊しておく
              await breakGoogleEventEnd(page.request, title, true)
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: title,
                    date,
                    start: '10:00',
                    end: '11:00',
                  })
                ).id,
              )
              await waitUnlistedSynced(page, date)
            },
            async ({ page, step, check }) => {
              await openWeek(page, date)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、${dayLabel(date)} の「${title}」があり、終了の日時を読めない（中継の gcalhold が壊して返す）。その週を週の表示で開く`,
              )
              await expectOneUnlisted(page)
              await expect(timedEvent(page, title)).toHaveCount(0)
              await expect(calendarAllDayRowLabel(page)).toHaveCount(0)
              // 予定の 10:00〜11:00 と、対照で動かす先の 11:00〜12:00 が、どちらの判定の画像にも映るようにする
              await calendarTimeLabel(page, '11:00:00').scrollIntoViewIfNeeded()
              await check(
                `通知の欄に「カレンダーに出せない予定が 1 件あります」「${OKADA.staff.name}: 1 件」と Google カレンダーで確認する案内が出る。時刻の格子と「終日」の行には何も出ない`,
              )

              await step(
                `（撮影のため、対照として、gcalhold が壊すのをやめ、calendarpit の管理の API で「${title}」を 11:00〜12:00 に動かして同期に読み直させる）`,
              )
              await breakGoogleEventEnd(page.request, title, false)
              await shiftGoogleEvent(page.request, OKADA.calendarId, ids[0])
              await step('予定のカレンダーを開き直す')
              await expect(async () => {
                await page.reload()
                await expect(timedEvent(page, title)).toBeVisible()
              }).toPass()
              await expect(unlistedNotice(page)).toHaveCount(0)
              await calendarTimeLabel(page, '11:00:00').scrollIntoViewIfNeeded()
              await check(
                `終了を読める時刻に戻すと、${dayLabel(date)} の 11:00〜12:00 の格子に「${title}」が出て、件数の通知が消える`,
              )
            },
          )
        } finally {
          await breakGoogleEventEnd(request, title, false)
          await deleteEvents(request, ids)
        }
      })

      test(`${label}土曜から月曜にかかる時刻のある予定がある場合、始まる週と終わる週のどちらでも件数が 1 件と出て、格子には出ないこと`, async ({
        browser,
        request,
      }) => {
        const first = sundayOfWeek(7)
        const second = sundayOfWeek(8)
        const saturday = addDays(first, 6)
        const monday = addDays(second, 1)
        const controlDate = addDays(first, 2)
        const title = `夜間待機 ${stamp()}`
        const controlTitle = `担当者会議 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'unlisted-multi-day',
              title: '2 日にわたる予定の件数と、週をまたぐ数え方',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: title,
                    date: saturday,
                    start: '09:00',
                    endDate: monday,
                    end: '18:00',
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: controlTitle,
                    date: controlDate,
                    start: '10:00',
                    end: '11:00',
                  })
                ).id,
              )
              await waitUnlistedSynced(page, first)
              await expect(timedEvent(page, controlTitle)).toBeVisible()
            },
            async ({ page, step, check }) => {
              await openWeek(page, first)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、${dayLabel(saturday)} 09:00 から ${dayLabel(monday)} 18:00 の「${title}」と、${dayLabel(controlDate)} 10:00〜11:00 の「${controlTitle}」がある。予定が始まる週を週の表示で開く`,
              )
              const control = timedEvent(page, controlTitle)
              await control.scrollIntoViewIfNeeded()
              await expect(control).toBeVisible()
              await expectOneUnlisted(page)
              await expect(timedEvent(page, title)).toHaveCount(0)
              await check(
                `通知の欄に「カレンダーに出せない予定が 1 件あります」「${OKADA.staff.name}: 1 件」が出て、格子に「${title}」は出ない。対照の 1 日に収まる「${controlTitle}」は格子に出る`,
              )

              await step('予定が終わる次の週を開く')
              await openWeek(page, second)
              await expectOneUnlisted(page)
              await expect(timedEvent(page, title)).toHaveCount(0)
              await check(
                `終わる週でも、通知の欄に「カレンダーに出せない予定が 1 件あります」「${OKADA.staff.name}: 1 件」が出て、格子に「${title}」は出ない`,
              )
            },
          )
        } finally {
          await deleteEvents(request, ids)
        }
      })

      test(`${label}時刻のある予定と繰り返しの回と確認が必要な予定がある週に出せない予定もある場合、格子の予定と既にある通知がそのまま出て、件数の通知が並ぶこと`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(12)
        const monday = addDays(sunday, 1)
        const tuesday = addDays(sunday, 2)
        const wednesday = addDays(sunday, 3)
        const thursday = addDays(sunday, 4)
        const friday = addDays(sunday, 5)
        const timedTitle = `担当者会議 ${stamp()}`
        const weeklyTitle = `定例訪問 ${stamp()}`
        const spanTitle = `出張 ${stamp()}`
        const exceptionIds: string[] = []
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'timed-and-notices',
              title: '時刻のある予定と既にある通知',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: timedTitle,
                    date: monday,
                    start: '13:00',
                    end: '14:00',
                  })
                ).id,
              )
              const weekly = await createGoogleEvent(page.request, OKADA.calendarId, {
                summary: weeklyTitle,
                date: tuesday,
                start: '13:00',
                end: '14:00',
                recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU,WE,TH;COUNT=3'],
              })
              ids.push(weekly.id)
              exceptionIds.push(
                (
                  await createGoogleOccurrenceException(page.request, OKADA.calendarId, weekly, {
                    originalStart: `${wednesday}T13:00:00+09:00`,
                    start: `${wednesday}T14:00:00+09:00`,
                    end: `${wednesday}T15:00:00+09:00`,
                  })
                ).id,
              )
              // 取り消した回は、calendarpit では消した予定になるので、後で消さない
              await createGoogleOccurrenceException(page.request, OKADA.calendarId, weekly, {
                originalStart: `${thursday}T13:00:00+09:00`,
                start: `${thursday}T13:00:00+09:00`,
                end: `${thursday}T14:00:00+09:00`,
                isCancelled: true,
              })
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: '   ',
                    date: friday,
                    start: '10:00',
                    end: '11:00',
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: spanTitle,
                    date: thursday,
                    start: '09:00',
                    endDate: friday,
                    end: '18:00',
                  })
                ).id,
              )
              await waitUnlistedSynced(page, monday)
              await expect(async () => {
                await page.reload()
                await expect(page.getByTestId('schedule-calendar-needs-review')).toBeVisible()
                await expect(
                  timedEvent(page, weeklyTitle).filter({ hasText: '14:00〜15:00' }),
                ).toBeVisible()
              }).toPass()
            },
            async ({ page, step, check }) => {
              await openWeek(page, monday)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、${dayLabel(monday)} 13:00〜14:00 の「${timedTitle}」、毎週火水木の 13:00〜14:00 の「${weeklyTitle}」（${dayLabel(wednesday)} の回を 14:00〜15:00 に変え、${dayLabel(thursday)} の回を取り消した）、${dayLabel(friday)} のタイトルが空白だけの予定、${dayLabel(thursday)} 09:00 から翌日 18:00 の「${spanTitle}」がある週を、週の表示で開く`,
              )
              const weekly = timedEvent(page, weeklyTitle)
              await weekly.filter({ hasText: '14:00〜15:00' }).scrollIntoViewIfNeeded()
              await expect(timedEvent(page, timedTitle)).toContainText('13:00〜14:00')
              await expect(timedEvent(page, timedTitle)).toBeInViewport()
              await expect(weekly.filter({ hasText: '13:00〜14:00' })).toBeInViewport()
              await expect(weekly).toHaveCount(2)
              await expect(weekly.filter({ hasText: '13:00〜14:00' })).toHaveCount(1)
              await expect(weekly.filter({ hasText: '14:00〜15:00' })).toHaveCount(1)
              await expect(timedEvent(page, spanTitle)).toHaveCount(0)
              await check(
                `格子に「${timedTitle}」と「${weeklyTitle}」の ${dayLabel(tuesday)} 13:00 の回と、時刻を変えた ${dayLabel(wednesday)} 14:00 の回が出て、取り消した ${dayLabel(thursday)} の回は出ない`,
              )

              await expect(page.getByTestId('schedule-calendar-needs-review')).toContainText(
                '確認が必要な予定が 1 件あります',
              )
              await expectOneUnlisted(page)
              await check(
                `通知の欄に「確認が必要な予定が 1 件あります」の通知と、「カレンダーに出せない予定が 1 件あります」「${OKADA.staff.name}: 1 件」の通知が並んで出る`,
              )

              await step(`時刻を変えた ${dayLabel(wednesday)} 14:00 の「${weeklyTitle}」を押す`)
              const moved = weekly.filter({ hasText: '14:00〜15:00' })
              await moved.scrollIntoViewIfNeeded()
              await moved.click()
              await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
              await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
                detailDateTimeText(wednesday, '14:00', '15:00'),
              )
              await check(
                `予定の詳細が開き、日時が「${detailDateTimeText(wednesday, '14:00', '15:00')}」と出る`,
              )
            },
          )
        } finally {
          await deleteEvents(request, exceptionIds)
          await deleteEvents(request, ids)
        }
      })
    }
  })
})
