import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, LOGIN_EMAIL, LOGIN_STAFF, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { deleteGoogleEvent, listGoogleEvents } from '../../fixtures/googleCalendar'
import { createWeeklyNormalSchedule, newScheduleId } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`
const OKADA_ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 今日の曜日。0 が日曜。 */
const todayWeekday = () => new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => daysFromToday(((8 - todayWeekday()) % 7 || 7) + days)

/**
 * 今日を含む週（日曜に始まる）の前の週の月曜から、days 日後の日付（YYYY-MM-DD）。
 * この月曜は今日より前で、今日と別の週にある。適用の日（今日）の週から数えると、隔週の並びがずれる日である。
 */
const fromLastWeekMonday = (days: number) => daysFromToday(-todayWeekday() - 6 + days)

/** 日の表示の staffId の列の、title の予定。 */
const dayEvent = (page: Page, staffId: string, title: string) =>
  page
    .getByTestId(`day-grid-staff-${staffId}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

const openDay = async (page: Page, staffId: string, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${staffId}`)).toBeVisible()
}

/** date の日の表示を開き、staffId の列に title の予定が出るか（shown）を確認して、check に結果の文を渡す。 */
const checkDay = async (
  page: Page,
  check: (text: string) => Promise<void>,
  staffId: string,
  date: string,
  title: string,
  shown: boolean,
  weekday: string,
) => {
  await openDay(page, staffId, date)
  const event = dayEvent(page, staffId, title)
  if (shown) await expect(event).toBeVisible()
  else await expect(event).toBeHidden()
  await check(`${date}（${weekday}）に「${title}」が${shown ? '出る' : '出ない'}`)
}

/** 日の表示で title の予定の詳細を開き、「繰り返しを変更」の「カスタム…」で、曜日の「木」を足して保存する。間隔は interval にする。 */
const changeToMondayThursday = async (
  page: Page,
  step: (text: string) => Promise<void>,
  staffId: string,
  title: string,
  interval: string,
) => {
  const event = dayEvent(page, staffId, title)
  await event.scrollIntoViewIfNeeded()
  await event.click()
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-detail-edit-recurrence').click()
  await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
  await step(
    `「繰り返しを変更」の「カスタム…」で、間隔を ${interval} にし、曜日の「木」を押して「保存」を押す`,
  )
  await page.getByTestId('recurring-rule-preset').selectOption('custom')
  await page.getByTestId('recurring-rule-interval').fill(interval)
  await page.getByTestId('recurring-rule-day-of-week-4').check()
  await page.getByTestId('schedule-recurrence-submit').click()
  await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
}

/** ログインし、staff の start からの、間隔が interval の毎週月曜の通常の予定（10:00〜11:00）を予定の API で作る。 */
const prepareMonday =
  (
    title: string,
    start: string,
    interval: number,
    email: string,
    staff: { id: string },
    facilityId: string,
  ) =>
  async (page: Page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, email)
    const token = await issueAccessToken(page.request, email)
    const created = await createWeeklyNormalSchedule(page.request, token, facilityId, {
      id: newScheduleId(),
      staffId: staff.id,
      title,
      date: start,
      rule: { days_of_week: [1], interval },
    })
    expect(created.status()).toBe(201)
  }

/**
 * calendarpit の Calendar API（events.list の singleEvents）が返す、calendarId の title の予定の回の日付（YYYY-MM-DD）。
 * from の 0 時から to の 0 時（Asia/Tokyo）までの回を読む。
 */
const googleInstanceDates = async (
  request: APIRequestContext,
  calendarId: string,
  title: string,
  from: string,
  to: string,
) => {
  const res = await request.get(
    `${CALENDARPIT_URL}/__calendarpit/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      params: {
        singleEvents: true,
        maxResults: 2500,
        timeMin: `${from}T00:00:00+09:00`,
        timeMax: `${to}T00:00:00+09:00`,
      },
    },
  )
  expect(res.ok()).toBe(true)
  const { items = [] } = (await res.json()) as {
    items?: { summary?: string; start?: { dateTime?: string } }[]
  }
  return items
    .filter((item) => item.summary === title)
    .map((item) => item.start?.dateTime?.slice(0, 10) ?? '')
    .sort()
}

test.describe('繰り返しの変更', () => {
  test.describe('隔週の 1 週目', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      // 改修前は、適用の日（今日）の週を 1 週目にするので、開いた回の週から 1 週ずれる
      const fixed = variant.name !== 'before'

      test(`${prefix}今日より前の回を開き、隔週の月曜と木曜に変えた場合、開いた回の週から 2 週ごとの月曜と木曜のうち、今日以降の日に回が出ること`, async ({
        browser,
      }) => {
        const title = `隔週の訪問 ${Date.now()}`
        const opened = fromLastWeekMonday(0)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-first-week-past',
            title:
              '今日より前の回を開き「繰り返しを変更」で隔週の月曜と木曜にすると、開いた回の週から 2 週ごとの月曜と木曜のうち、今日以降の日に回が出る',
            actor: ACTOR,
            variant,
          },
          prepareMonday(
            title,
            fromLastWeekMonday(-14),
            2,
            LOGIN_EMAIL,
            LOGIN_STAFF,
            STAFF_FORM.facilityId,
          ),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, opened)
            await step(
              `今日は ${daysFromToday(0)}。${fromLastWeekMonday(-14)} から隔週の月曜 10:00〜11:00 の「${title}」を作ってある。今日より前の ${opened}（月曜）の回を開く`,
            )
            await changeToMondayThursday(page, step, LOGIN_STAFF.id, title, '2')

            const at = (days: number, weekday: string, onOpenedWeeks: boolean) =>
              checkDay(
                page,
                check,
                LOGIN_STAFF.id,
                fromLastWeekMonday(days),
                title,
                onOpenedWeeks === fixed,
                weekday,
              )
            await at(14, '月曜', true)
            await at(17, '木曜', true)
            await at(21, '月曜', false)
            await at(24, '木曜', false)
            await checkDay(page, check, LOGIN_STAFF.id, opened, title, true, '月曜')
          },
        )
      })

      test(`${prefix}今日以降の回を開き、隔週の月曜と木曜に変えた場合、開いた回の週から 2 週ごとの月曜と木曜に回が出ること`, async ({
        browser,
      }) => {
        const title = `隔週の訪問 ${Date.now()}`
        const start = fromNextMonday(0)
        const opened = fromNextMonday(7)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-first-week-future',
            title:
              '今日以降の回を開き「繰り返しを変更」で隔週の月曜と木曜にすると、改修の前と同じく、開いた回の週から 2 週ごとの月曜と木曜に回が出る',
            actor: ACTOR,
            variant,
          },
          prepareMonday(title, start, 1, LOGIN_EMAIL, LOGIN_STAFF, STAFF_FORM.facilityId),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, opened)
            await step(
              `${start} から毎週月曜 10:00〜11:00 の「${title}」を作ってある。${opened}（月曜）の回を開く`,
            )
            await changeToMondayThursday(page, step, LOGIN_STAFF.id, title, '2')

            await checkDay(page, check, LOGIN_STAFF.id, opened, title, true, '月曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(10), title, true, '木曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(14), title, false, '月曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(17), title, false, '木曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(21), title, true, '月曜')
          },
        )
      })

      test(`${prefix}Google カレンダーを正本にする事業所で、今日より前の回を開き、隔週の月曜と木曜に変えた場合、Google カレンダーにも同じ日の回が出ること`, async ({
        browser,
        request,
      }) => {
        const title = `隔週の訪問 ${Date.now()}`
        const opened = fromLastWeekMonday(0)
        const expected = fixed
          ? [fromLastWeekMonday(14), fromLastWeekMonday(17)]
          : [fromLastWeekMonday(21), fromLastWeekMonday(24)]
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-first-week-google-primary',
            title:
              'Google カレンダーを正本にする事業所で、今日より前の回から隔週の月曜と木曜に変えると、開いた回の週から数えた日に、Google カレンダー（calendarpit）にも buddy と同じ回が出る',
            actor: OKADA_ACTOR,
            variant,
          },
          prepareMonday(
            title,
            fromLastWeekMonday(-14),
            2,
            OKADA.email,
            OKADA.staff,
            OKADA.facilityId,
          ),
          async ({ page, step, check }) => {
            try {
              await openDay(page, OKADA.staff.id, opened)
              await step(
                `今日は ${daysFromToday(0)}。${fromLastWeekMonday(-14)} から隔週の月曜の「${title}」を ${OKADA.staff.name} の Google カレンダーに作ってある。今日より前の ${opened}（月曜）の回を開く`,
              )
              await changeToMondayThursday(page, step, OKADA.staff.id, title, '2')

              const at = (days: number, weekday: string, onOpenedWeeks: boolean) =>
                checkDay(
                  page,
                  check,
                  OKADA.staff.id,
                  fromLastWeekMonday(days),
                  title,
                  onOpenedWeeks === fixed,
                  weekday,
                )
              await at(14, '月曜', true)
              await at(17, '木曜', true)
              await at(21, '月曜', false)

              await expect
                .poll(() =>
                  googleInstanceDates(
                    request,
                    OKADA.calendarId,
                    title,
                    fromLastWeekMonday(14),
                    fromLastWeekMonday(28),
                  ),
                )
                .toEqual(expected)
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${expected[0]}（新しい規則の最初の回）を開く`,
              )
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${expected[0]}`,
              )
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await check(
                `calendarpit の ${expected[0]}（月曜）に「${title}」が出る。calendarpit の Calendar API が返す ${fromLastWeekMonday(14)} から 2 週の回は ${expected.join('、')} で、buddy と同じ`,
              )
            } finally {
              for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
                if (event.summary === title)
                  await deleteGoogleEvent(request, OKADA.calendarId, event.id)
              }
            }
          },
        )
      })
    }
  })
})
