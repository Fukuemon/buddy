import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { addDays, dayLabel, sundayOfWeek } from '../../fixtures/date'
import { OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  breakGoogleEventEnd,
  createGoogleAllDayEvent,
  createGoogleEvent,
  createGoogleOccurrenceException,
  deleteGoogleEvent,
} from '../../fixtures/googleCalendar'
import { registerPatient } from '../../fixtures/patient'
import { signInAtBroker } from '../../screens/login'
import { calendarTimeLabel } from '../../selectors/scheduleCalendar'

// #594 の受け入れの条件の 5 つ目の検証のシナリオ（docs/verification/594-google-primary-events/scenarios.md）を撮る。
// 字幕の文はシナリオの文を写す。判定は、人が動画を見て行う

const ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

/**
 * 予定のタイトルの後ろに付ける、今の時刻のミリ秒の下 3 桁。走らせるたびに違うタイトルにする。
 * 週の表示の列は狭く、長いタイトルは末尾が切れるので、時刻の全ての桁は付けない。
 */
const stamp = () => String(Date.now()).slice(-3)

/** EXDATE の行に書く、終日の回の日付（YYYYMMDD）。 */
const exDate = (date: string) => date.replaceAll('-', '')

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, OKADA.email)
}

const openWeek = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=week&date=${date}`)
  await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
}

/** 週の表示の時刻の格子の、text を含む時刻のある予定。 */
const timedEvent = (page: Page, text: string) =>
  page
    .getByTestId('schedule-calendar')
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: text })

/** 予定のカレンダーの、タイトルが title の終日の予定のラベル。 */
const allDayLabel = (page: Page, title: string) =>
  page
    .getByTestId('schedule-calendar')
    .getByTestId(/^all-day-event-/)
    .filter({ hasText: title })

/** 通知の欄の、確認が必要な予定の通知。 */
const needsReviewNotice = (page: Page) => page.getByTestId('schedule-calendar-needs-review')

/** 通知の欄の、カレンダーに出せない予定の通知。 */
const unlistedNotice = (page: Page) => page.getByTestId('schedule-calendar-unlisted')

/** 同期が予定を写して条件 synced が満たされるまで、週の表示を開き直す。 */
const waitSynced = async (page: Page, date: string, synced: () => Promise<void>) => {
  await openWeek(page, date)
  await expect(async () => {
    await page.reload()
    await synced()
  }).toPass()
}

/** test で作った Google カレンダーの予定を消す。消した予定が、ほかのシナリオの通知と件数に残らないようにする。 */
const deleteEvents = async (request: APIRequestContext, ids: string[]) => {
  for (const id of ids) await deleteGoogleEvent(request, OKADA.calendarId, id)
}

/** 確認が必要な予定の理由の文。web の SCHEDULE_REVIEW_REASON_LABEL と同じ文である。 */
const REASON = {
  recurrenceUnsupported: '繰り返しの規則を buddy で表せないため、最初の回だけを表示しています',
  patientNotFound: 'タイトルの利用者が見つかりません',
  patientAmbiguous: 'タイトルの利用者が 2 人以上います',
  serviceCodeNotFound: 'タイトルのサービス内容がサービスコードにありません',
  titleUnreadable: 'タイトルを読めません',
} as const

test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーを正本にする事業所の、取り込めない予定の扱い', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${label}繰り返しの予定の回を変えたか取り消した場合と、buddy の規則に写せない繰り返しの予定がある場合、回が格子に出て、写せない予定は確認が必要な予定に出ること`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(2)
        const monday = addDays(sunday, 1)
        const tuesday = addDays(sunday, 2)
        const wednesday = addDays(sunday, 3)
        const thursday = addDays(sunday, 4)
        const weeklyTitle = `定例訪問 ${stamp()}`
        const unsupportedTitle = `隔日 ${stamp()}`
        const exceptionIds: string[] = []
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 's1-recurring',
              title: '繰り返しの予定と例外の回',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
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
                    start: `${wednesday}T15:00:00+09:00`,
                    end: `${wednesday}T16:00:00+09:00`,
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
              // 間隔が 2 以上の毎日は、buddy の繰り返しの規則に写せない（RuleFromRecurrence）
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: unsupportedTitle,
                    date: monday,
                    start: '10:00',
                    end: '11:00',
                    recurrence: ['RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3'],
                  })
                ).id,
              )
              await waitSynced(page, monday, async () => {
                await expect(
                  timedEvent(page, weeklyTitle).filter({ hasText: '15:00〜16:00' }),
                ).toBeVisible()
                await expect(needsReviewNotice(page)).toContainText(REASON.recurrenceUnsupported)
              })
            },
            async ({ page, step, check }) => {
              await openWeek(page, monday)
              await step(
                `前提 ${OKADA.staff.name} の Google カレンダーに、毎週火水木の 13:00〜14:00 の「${weeklyTitle}」（${dayLabel(wednesday)} の回を 15:00〜16:00 に変え、${dayLabel(thursday)} の回を取り消した）と、${dayLabel(monday)} 10:00 から 1 日おきに 3 回の「${unsupportedTitle}」がある\nもし その週を週の表示で開く`,
              )
              const weekly = timedEvent(page, weeklyTitle)
              // 13:00 の回と 15:00 の回の両方を、判定の画像に映す
              await calendarTimeLabel(page, '14:00:00').scrollIntoViewIfNeeded()
              await expect(weekly).toHaveCount(2)
              await expect(weekly.filter({ hasText: '13:00〜14:00' })).toHaveCount(1)
              await expect(weekly.filter({ hasText: '15:00〜16:00' })).toHaveCount(1)
              await check(
                `ならば 格子に「${weeklyTitle}」の ${dayLabel(tuesday)} 13:00 の回と、時刻を変えた ${dayLabel(wednesday)} 15:00 の回が出て、取り消した ${dayLabel(thursday)} の回は出ない`,
              )

              await expect(timedEvent(page, unsupportedTitle)).toHaveCount(1)
              await expect(needsReviewNotice(page)).toContainText(REASON.recurrenceUnsupported)
              await timedEvent(page, unsupportedTitle).scrollIntoViewIfNeeded()
              await check(
                `かつ 「${unsupportedTitle}」は ${dayLabel(monday)} の最初の回だけが格子に出て、通知の欄の確認が必要な予定に「${REASON.recurrenceUnsupported}」と出る`,
              )
            },
          )
        } finally {
          await deleteEvents(request, exceptionIds)
          await deleteEvents(request, ids)
        }
      })

      test(`${label}1 日の終日の予定、何日かにわたる終日の予定、回を除外した繰り返しの終日の予定がある場合、かかる日と回の日の「終日」の行に出ること`, async ({
        browser,
        request,
      }) => {
        const first = sundayOfWeek(3)
        const second = sundayOfWeek(4)
        const singleTitle = `休み ${stamp()}`
        const spanTitle = `研修旅行 ${stamp()}`
        const weeklyTitle = `定例 ${stamp()}`
        const excluded = addDays(first, 4)
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 's2-all-day',
              title: '終日の予定',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: singleTitle,
                    startDate: addDays(first, 1),
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: spanTitle,
                    startDate: addDays(first, 3),
                    lastDate: addDays(first, 5),
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: weeklyTitle,
                    startDate: addDays(first, 2),
                    recurrence: [
                      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4',
                      `EXDATE;VALUE=DATE:${exDate(excluded)}`,
                    ],
                  })
                ).id,
              )
              await waitSynced(page, first, async () => {
                await expect(allDayLabel(page, singleTitle)).toBeVisible()
                await expect(allDayLabel(page, spanTitle)).toBeVisible()
                await expect(allDayLabel(page, weeklyTitle)).toBeVisible()
              })
            },
            async ({ page, step, check }) => {
              await openWeek(page, first)
              await step(
                `前提 ${OKADA.staff.name} の Google カレンダーに、${dayLabel(addDays(first, 1))} の終日の「${singleTitle}」、${dayLabel(addDays(first, 3))} から ${dayLabel(addDays(first, 5))} の終日の「${spanTitle}」、毎週火曜と木曜の終日の「${weeklyTitle}」（${dayLabel(excluded)} の回を除外した）がある\nもし 1 つ目の週を週の表示で開く`,
              )
              await expect(allDayLabel(page, singleTitle)).toHaveCount(1)
              await expect(allDayLabel(page, spanTitle)).toHaveCount(1)
              await expect(allDayLabel(page, weeklyTitle)).toHaveCount(1)
              await check(
                `ならば 「終日」の行の ${dayLabel(addDays(first, 1))} に「${singleTitle}」、${dayLabel(addDays(first, 3))} から ${dayLabel(addDays(first, 5))} に「${spanTitle}」、${dayLabel(addDays(first, 2))} に「${weeklyTitle}」が出て、除外した ${dayLabel(excluded)} には「${weeklyTitle}」が出ない`,
              )

              await step('もし 次の週を開く')
              await openWeek(page, second)
              await expect(allDayLabel(page, weeklyTitle)).toHaveCount(2)
              await expect(needsReviewNotice(page)).toHaveCount(0)
              await check(
                `ならば 「終日」の行の ${dayLabel(addDays(second, 2))} と ${dayLabel(addDays(second, 4))} に「${weeklyTitle}」が出る`,
              )
            },
          )
        } finally {
          await deleteEvents(request, ids)
        }
      })

      test(`${label}タイトルから訪問の情報に変換できない予定がある場合、格子に出て、確認が必要な予定に理由と一緒に出ること`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(5)
        const monday = addDays(sunday, 1)
        const n = stamp()
        const patientName = `検証 花子${n}`
        const twinName = `検証 双子${n}`
        const visitTitle = `【訪看I2】${patientName}`
        const notFoundTitle = `【訪看I2】未登録 太郎${n}`
        const codeTitle = `【未登録の訪問】${patientName}`
        const twinTitle = `【訪看I2】${twinName}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 's3-visit-unresolved',
              title: '訪問の情報に変換できない予定',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              const token = await issueAccessToken(page.request, OKADA.email)
              for (const name of [patientName, twinName, twinName]) {
                const res = await registerPatient(page.request, token, OKADA.facilityId, {
                  name,
                  assignedStaffId: OKADA.staff.id,
                })
                expect(res.status()).toBe(201)
              }
              // 5 件を月曜から金曜の同じ時刻に置き、1 枚の判定の画像に全てを映す
              const titles = [visitTitle, notFoundTitle, codeTitle, twinTitle, '   ']
              for (const [i, summary] of titles.entries())
                ids.push(
                  (
                    await createGoogleEvent(page.request, OKADA.calendarId, {
                      summary,
                      date: addDays(monday, i),
                      start: '10:00',
                      end: '11:00',
                    })
                  ).id,
                )
              await waitSynced(page, monday, async () => {
                await expect(timedEvent(page, '10:00〜11:00')).toHaveCount(5)
                await expect(needsReviewNotice(page)).toContainText(
                  '確認が必要な予定が 4 件あります',
                )
              })
            },
            async ({ page, step, check }) => {
              await openWeek(page, monday)
              await step(
                `前提 ${OKADA.staff.name} の Google カレンダーの ${dayLabel(monday)} から ${dayLabel(addDays(monday, 4))} の 10:00〜11:00 に、順に「${visitTitle}」（登録した利用者）、「${notFoundTitle}」（登録していない利用者）、「${codeTitle}」（サービスコードに無いサービス内容）、「${twinTitle}」（同じ名前の利用者が 2 人いる）、タイトルが空白だけの予定がある\nもし その週を週の表示で開く`,
              )
              await calendarTimeLabel(page, '10:00:00').scrollIntoViewIfNeeded()
              await expect(timedEvent(page, '10:00〜11:00')).toHaveCount(5)
              await check(
                `ならば ${dayLabel(monday)} から ${dayLabel(addDays(monday, 4))} の格子の 10:00 に、5 件の予定が出る`,
              )

              const notice = needsReviewNotice(page)
              await notice.scrollIntoViewIfNeeded()
              await expect(notice).toContainText('確認が必要な予定が 4 件あります')
              for (const reason of [
                REASON.patientNotFound,
                REASON.serviceCodeNotFound,
                REASON.patientAmbiguous,
                REASON.titleUnreadable,
              ])
                await expect(notice).toContainText(reason)
              await check(
                `かつ 通知の欄に「確認が必要な予定が 4 件あります」と出て、「${REASON.patientNotFound}」「${REASON.serviceCodeNotFound}」「${REASON.patientAmbiguous}」「${REASON.titleUnreadable}」の 4 件が並ぶ。登録した利用者の「${visitTitle}」は確認が必要な予定に出ない`,
              )
            },
          )
        } finally {
          await deleteEvents(request, ids)
        }
      })

      test(`${label}時刻を読めない予定と 2 日にわたる予定がある場合、格子に出ずに通知の欄の件数に数えられ、同じ週のほかの予定は格子に出ること`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(7)
        const monday = addDays(sunday, 1)
        const tuesday = addDays(sunday, 2)
        const wednesday = addDays(sunday, 3)
        const thursday = addDays(sunday, 4)
        const brokenTitle = `訪問調整 ${stamp()}`
        const spanTitle = `夜間待機 ${stamp()}`
        const controlTitle = `担当者会議 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 's4-unlisted',
              title: 'カレンダーに出せない予定',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              // 予定の ID は作るまで分からないので、作る前にタイトルで壊しておく
              await breakGoogleEventEnd(page.request, brokenTitle, true)
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: brokenTitle,
                    date: monday,
                    start: '10:00',
                    end: '11:00',
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: spanTitle,
                    date: wednesday,
                    start: '09:00',
                    endDate: thursday,
                    end: '18:00',
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: controlTitle,
                    date: tuesday,
                    start: '13:00',
                    end: '14:00',
                  })
                ).id,
              )
              await waitSynced(page, monday, async () => {
                await expect(timedEvent(page, controlTitle)).toBeVisible()
                await expect(unlistedNotice(page)).toContainText(
                  'カレンダーに出せない予定が 2 件あります',
                )
              })
            },
            async ({ page, step, check }) => {
              await openWeek(page, monday)
              await step(
                `前提 ${OKADA.staff.name} の Google カレンダーに、${dayLabel(monday)} の終了の日時を読めない「${brokenTitle}」（中継の gcalhold が壊して返す）、${dayLabel(wednesday)} 09:00 から翌日 18:00 の「${spanTitle}」、${dayLabel(tuesday)} 13:00〜14:00 の「${controlTitle}」がある\nもし その週を週の表示で開く`,
              )
              const notice = unlistedNotice(page)
              await expect(notice).toContainText('カレンダーに出せない予定が 2 件あります')
              await expect(
                page.getByTestId(`schedule-calendar-unlisted-${OKADA.staff.id}`),
              ).toHaveText(`${OKADA.staff.name}: 2 件`)
              await expect(notice).toContainText('Google カレンダーで確認してください')
              await check(
                `ならば 通知の欄に「カレンダーに出せない予定が 2 件あります」「${OKADA.staff.name}: 2 件」と、Google カレンダーで確認する案内が出る`,
              )

              await timedEvent(page, controlTitle).scrollIntoViewIfNeeded()
              await expect(timedEvent(page, controlTitle)).toBeVisible()
              await expect(timedEvent(page, brokenTitle)).toHaveCount(0)
              await expect(timedEvent(page, spanTitle)).toHaveCount(0)
              await check(
                `かつ 格子に「${controlTitle}」が出て、「${brokenTitle}」と「${spanTitle}」は出ない`,
              )
            },
          )
        } finally {
          await breakGoogleEventEnd(request, brokenTitle, false)
          await deleteEvents(request, ids)
        }
      })

      test(`${label}buddy の規則に写せない繰り返しの終日の予定がある場合、最初の回が「終日」の行に出て、どの週でも確認が必要な予定に理由と一緒に出ること`, async ({
        browser,
        request,
      }) => {
        const first = sundayOfWeek(8)
        const second = sundayOfWeek(9)
        const monday = addDays(first, 1)
        const title = `当番 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 's5-all-day-unsupported',
              title: '写せない繰り返しの終日の予定',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              await signIn(page)
              // 間隔が 2 以上の毎日は、buddy の繰り返しの規則に写せない（RuleFromRecurrence）
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: title,
                    startDate: monday,
                    recurrence: ['RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5'],
                  })
                ).id,
              )
              await waitSynced(page, first, async () => {
                await expect(allDayLabel(page, title).first()).toBeVisible()
              })
            },
            async ({ page, step, check }) => {
              const reviewItem = needsReviewNotice(page)
                .getByTestId(/^schedule-calendar-needs-review-all-day-/)
                .filter({ hasText: dayLabel(monday) })
                .filter({ hasText: REASON.recurrenceUnsupported })
              const expectReviewed = async () => {
                if (isBefore) {
                  await expect(needsReviewNotice(page)).toHaveCount(0)
                  return
                }
                await expect(reviewItem).toHaveCount(1)
                await reviewItem.scrollIntoViewIfNeeded()
              }

              await openWeek(page, first)
              await step(
                `前提 ${OKADA.staff.name} の Google カレンダーに、${dayLabel(monday)} から 1 日おきに 5 回の終日の「${title}」がある（回は ${[0, 2, 4, 6, 8].map((d) => dayLabel(addDays(monday, d))).join('、')}）\nもし 1 つ目の週を週の表示で開く`,
              )
              await expect(allDayLabel(page, title)).toHaveCount(1)
              await expectReviewed()
              await check(
                `ならば 「終日」の行の ${dayLabel(monday)} にだけ「${title}」が出て、通知の欄の確認が必要な予定に ${dayLabel(monday)} と「${REASON.recurrenceUnsupported}」が出る`,
              )

              await step('もし 次の週を開く')
              await openWeek(page, second)
              await expect(allDayLabel(page, title)).toHaveCount(0)
              await expectReviewed()
              await check(
                `ならば 「終日」の行に「${title}」が出ず、通知の欄の確認が必要な予定に ${dayLabel(monday)} と「${REASON.recurrenceUnsupported}」が出る`,
              )
            },
          )
        } finally {
          await deleteEvents(request, ids)
        }
      })
    }
  })
})
