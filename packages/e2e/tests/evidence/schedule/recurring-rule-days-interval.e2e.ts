import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  CALENDARPIT_URL,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OKADA,
  OKADA_STATE,
} from '../../fixtures/env'
import { storyUrl } from '../../fixtures/evidence'
import { deleteGoogleEvent, listGoogleEvents } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { createWeeklyNormalSchedule, newScheduleId } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { fieldNote } from '../../selectors/formField'
import { acceptBrowserDialog } from '../../widgets/browserDialog/actions/browserDialog'

const BIWEEKLY_DAYS_URL = storyUrl('画面-schedule-recurringrulefields--biweekly-days')

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。日曜に始まる週の月曜から数える。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

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

/** date の日の表示を開き、staffId の列に title の予定が出るか（shown）を、判定の字幕で確認する。 */
const checkDay = async (
  page: Page,
  staffId: string,
  date: string,
  title: string,
  shown: boolean,
  weekday: string,
) => {
  await step(page, `${date}（${weekday}）の日の表示を開く`, () => openDay(page, staffId, date))
  await check(page, `${date}（${weekday}）に「${title}」が${shown ? '出る' : '出ない'}`, () => {
    const event = dayEvent(page, staffId, title)
    return shown ? expect(event).toBeVisible() : expect(event).toBeHidden()
  })
}

/** 日の表示で title の予定の詳細を開き、「編集」のメニューの「繰り返しを変更」を押して、「カスタム…」を選ぶ。 */
const openCustomRecurrence = (page: Page, staffId: string, title: string) =>
  step(
    page,
    `「${title}」の詳細を開き、「編集」の「繰り返しを変更」で「カスタム…」を選ぶ`,
    async () => {
      const event = dayEvent(page, staffId, title)
      await event.scrollIntoViewIfNeeded()
      await event.click()
      await page.getByTestId('schedule-detail-edit').click()
      await page.getByTestId('schedule-detail-edit-recurrence').click()
      await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
      await page.getByTestId('recurring-rule-preset').selectOption('custom')
    },
  )

/** 間隔の欄に value を入れる。 */
const fillInterval = (page: Page, value: string) =>
  page.getByTestId('recurring-rule-interval').fill(value)

/** 録画の外で、storageState の職員のトークンで、staff の start からの毎週の通常の予定（10:00〜11:00）を予定の API で作る。 */
const prepareWeekly = (
  browser: Browser,
  o: {
    storageState: string
    email: string
    title: string
    start: string
    staff: { id: string }
    facilityId: string
  },
) =>
  prepareOutsideRecording(browser, { storageState: o.storageState }, async (page) => {
    const token = await issueAccessToken(page.request, o.email)
    const created = await createWeeklyNormalSchedule(page.request, token, o.facilityId, {
      id: newScheduleId(),
      staffId: o.staff.id,
      title: o.title,
      date: o.start,
    })
    expect(created.status()).toBe(201)
  })

/** 青木 陽菜で、1 つ目の事業所の予定を作る前準備。 */
const prepareAsAoki = (browser: Browser, title: string, start: string) =>
  prepareWeekly(browser, {
    storageState: LOGIN_STATE,
    email: LOGIN_EMAIL,
    title,
    start,
    staff: LOGIN_STAFF,
    facilityId: STAFF_FORM.facilityId,
  })

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
  // 改修前は、カスタムで木曜と間隔を引き継がない。改修前と並べて比べるので、確認する関数は、
  // 両方の版で選んでいる月曜だけを見る。木曜と間隔 2 は、判定のスクリーンショットで比べる
  test.describe('規則の欄の間隔と複数の曜日（ログインなし、Storybook の story）', () => {
    test(
      'recurring-rule-custom-days-interval 隔週の月曜と木曜の規則で「カスタム…」を選んだ場合、間隔と、選んだ全ての曜日が出ること',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto(BIWEEKLY_DAYS_URL)
        await shiftStory(page)
        await expect(page.getByTestId('recurring-rule-preset')).toBeVisible()
        await intro(
          page,
          '隔週の月曜と木曜の規則で「カスタム…」を選ぶと、改修後は間隔 2 と、月曜と木曜の両方を選んだ曜日の欄が出て、曜日を足せる\n前提 繰り返しの欄（Storybook の RecurringRuleFields の BiweeklyDays）で、隔週の月曜と木曜の規則を 2026-10-22（木曜）の回から開いている（架空のデータ）',
        )

        await step(page, '繰り返しで「カスタム…」を選ぶ', async () => {
          await page.getByTestId('recurring-rule-preset').selectOption('custom')
        })
        await check(page, '頻度、間隔 2、曜日の欄が出て、月曜と木曜を選んでいる', () =>
          expect(page.getByTestId('recurring-rule-day-of-week-1')).toBeChecked(),
        )
        await step(page, '曜日の「金」を押す', () =>
          page.getByTestId('recurring-rule-day-of-week-5').click(),
        )
        await check(page, '「金」を押した後の、選んでいる曜日', () =>
          expect(page.getByTestId('recurring-rule-day-of-week-5')).toBeChecked(),
        )
      },
    )
  })

  // 以降のテストは、改修前は複数の曜日と間隔を選べないので、改修後だけを撮る
  test.describe(`規則の欄の間隔と複数の曜日（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('recurring-rule-days-buddy-primary 毎週月曜の繰り返しの予定の回から月曜と木曜にした場合、その日以降に月曜と木曜の回が出て、前の回は変わらないこと', async ({
      browser,
      context,
    }) => {
      const title = `週 2 回の定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      await prepareAsAoki(browser, title, start)

      const page = await context.newPage()
      await openDay(page, LOGIN_STAFF.id, effective)
      await intro(
        page,
        `毎週月曜の繰り返しの予定の回から「繰り返しを変更」で月曜と木曜にすると、その日以降に月曜と木曜の両方の回が出て、その日より前の回は変わらない\n前提 ${start} から毎週月曜 10:00〜11:00 の「${title}」を作ってある。${effective}（月曜）の日の表示を開いている`,
      )
      await openCustomRecurrence(page, LOGIN_STAFF.id, title)
      await step(page, '「繰り返しを変更」の「カスタム…」で、曜日の「木」を押す', () =>
        page.getByTestId('recurring-rule-day-of-week-4').check(),
      )
      await check(page, '曜日に月曜と木曜を選んでいる', async () => {
        await expect(page.getByTestId('recurring-rule-day-of-week-1')).toBeChecked()
        await expect(page.getByTestId('recurring-rule-day-of-week-4')).toBeChecked()
      })
      await step(page, '「保存」を押す', async () => {
        await page.getByTestId('schedule-recurrence-submit').click()
        await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
      })

      await checkDay(page, LOGIN_STAFF.id, effective, title, true, '月曜')
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(10), title, true, '木曜')
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(14), title, true, '月曜')
      await checkDay(page, LOGIN_STAFF.id, start, title, true, '月曜')
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(3), title, false, '木曜')
    })

    test('recurring-rule-interval-buddy-primary 毎週火曜の繰り返しの予定の回から間隔を 2 にした場合、開いた回の週から 2 週ごとの火曜に回が出ること', async ({
      browser,
      context,
    }) => {
      const title = `隔週の定例 ${Date.now()}`
      const start = fromNextMonday(1)
      const effective = fromNextMonday(8)
      await prepareAsAoki(browser, title, start)

      const page = await context.newPage()
      await openDay(page, LOGIN_STAFF.id, effective)
      await intro(
        page,
        `毎週火曜の繰り返しの予定の回から「繰り返しを変更」で間隔を 2 にすると、開いた回の週から 2 週ごとの火曜に回が出て、間の週には出ない\n前提 ${start} から毎週火曜 10:00〜11:00 の「${title}」を作ってある。${effective}（火曜）の日の表示を開いている`,
      )
      await openCustomRecurrence(page, LOGIN_STAFF.id, title)
      await step(page, '「繰り返しを変更」の「カスタム…」で、間隔に 2 を入れる', () =>
        fillInterval(page, '2'),
      )
      await check(page, '間隔が 2 になり、頻度が「隔週」になる', () =>
        expect(page.getByTestId('recurring-rule-frequency')).toContainText('隔週'),
      )
      await step(page, '「保存」を押す', async () => {
        await page.getByTestId('schedule-recurrence-submit').click()
        await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
      })

      await checkDay(page, LOGIN_STAFF.id, effective, title, true, '火曜')
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(15), title, false, '火曜')
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(22), title, true, '火曜')
      await checkDay(page, LOGIN_STAFF.id, start, title, true, '火曜')
    })

    test('recurring-rule-days-required 曜日を 1 つも選ばずに保存しようとした場合、曜日を選ぶ必要があることが分かり、保存されないこと', async ({
      browser,
      context,
    }) => {
      const title = `曜日の確認の定例 ${Date.now()}`
      const start = fromNextMonday(0)
      await prepareAsAoki(browser, title, start)

      const page = await context.newPage()
      await openDay(page, LOGIN_STAFF.id, start)
      await intro(
        page,
        `「繰り返しを変更」の「カスタム…」で曜日を全て外して「保存」を押すと、曜日を選ぶことを促す文が出て、保存されない\n前提 ${start} から毎週月曜の「${title}」を作ってある。${start} の日の表示を開いている`,
      )
      await openCustomRecurrence(page, LOGIN_STAFF.id, title)
      await step(
        page,
        '「繰り返しを変更」の「カスタム…」で、曜日の「月」を外して「保存」を押す',
        async () => {
          await page.getByTestId('recurring-rule-day-of-week-1').uncheck()
          await page.getByTestId('schedule-recurrence-submit').click()
        },
      )
      await check(
        page,
        '曜日の欄の下に「曜日を 1 つ以上選んでください」が出て、モーダルが開いたまま',
        async () => {
          await expect(
            fieldNote(
              page.getByTestId('schedule-recurrence-modal'),
              '曜日を 1 つ以上選んでください',
            ),
          ).toBeVisible()
          await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
        },
      )
      await step(page, '「キャンセル」を押し、変更を破棄して閉じる', async () => {
        const discard = '変更が破棄されますがよろしいですか？'
        const confirm = await acceptBrowserDialog(page, discard, () =>
          page.getByTestId('schedule-recurrence-cancel').click(),
        )
        expect(confirm).toBe(discard)
      })
      await checkDay(page, LOGIN_STAFF.id, start, title, true, '月曜')
    })

    test('recurring-rule-interval-range 間隔に 0 か 53 を入れて保存しようとした場合、間隔の範囲が分かり、保存されないこと', async ({
      browser,
      context,
    }) => {
      const title = `間隔の確認の定例 ${Date.now()}`
      const start = fromNextMonday(0)
      await prepareAsAoki(browser, title, start)

      const page = await context.newPage()
      await openDay(page, LOGIN_STAFF.id, start)
      await intro(
        page,
        `「繰り返しを変更」の「カスタム…」で間隔に 0 か 53 を入れて「保存」を押すと、1〜52 で入れることを促す文が出て、保存されない\n前提 ${start} から毎週月曜の「${title}」を作ってある。${start} の日の表示を開いている`,
      )
      await openCustomRecurrence(page, LOGIN_STAFF.id, title)
      const message = fieldNote(
        page.getByTestId('schedule-recurrence-modal'),
        '間隔は 1〜52 の週の数で入力してください',
      )
      await step(
        page,
        '「繰り返しを変更」の「カスタム…」で、間隔に 0 を入れて「保存」を押す',
        async () => {
          await fillInterval(page, '0')
          await page.getByTestId('schedule-recurrence-submit').click()
        },
      )
      await check(page, '間隔が 0 のとき、間隔の欄の下に範囲の文が出て、モーダルが開いたまま', () =>
        expect(message).toBeVisible(),
      )
      await step(page, '間隔に 53 を入れて「保存」を押す', async () => {
        await fillInterval(page, '53')
        await page.getByTestId('schedule-recurrence-submit').click()
      })
      await check(page, '間隔が 53 のときも、範囲の文が出て、モーダルが開いたまま', async () => {
        await expect(message).toBeVisible()
        await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
      })
    })
  })

  test.describe(`規則の欄の間隔と複数の曜日（${OKADA.staff.name}、予定を Google カレンダーで管理している事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('recurring-rule-days-interval-google-primary 予定を Google カレンダーで管理している事業所で、毎週月曜の繰り返しの予定を隔週の月曜と木曜に変えた場合、Google カレンダーにも同じ日の回が出ること', async ({
      browser,
      context,
      request,
    }) => {
      const title = `隔週 2 回の定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const expected = [effective, fromNextMonday(10), fromNextMonday(21), fromNextMonday(24)]
      await prepareWeekly(browser, {
        storageState: OKADA_STATE,
        email: OKADA.email,
        title,
        start,
        staff: OKADA.staff,
        facilityId: OKADA.facilityId,
      })

      const page = await context.newPage()
      try {
        await openDay(page, OKADA.staff.id, effective)
        await intro(
          page,
          `予定を Google カレンダーで管理している事業所で、毎週月曜の繰り返しの予定の回から隔週の月曜と木曜に変えると、Google カレンダー（calendarpit）にも buddy と同じ日に回が出る\n前提 ${start} から毎週月曜の「${title}」を ${OKADA.staff.name} の Google カレンダーに作ってある。${effective}（月曜）の日の表示を開いている`,
        )
        await openCustomRecurrence(page, OKADA.staff.id, title)
        await step(
          page,
          '「繰り返しを変更」の「カスタム…」で、間隔に 2 を入れ、曜日の「木」を押して「保存」を押す',
          async () => {
            await fillInterval(page, '2')
            await page.getByTestId('recurring-rule-day-of-week-4').check()
            await page.getByTestId('schedule-recurrence-submit').click()
            await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
          },
        )

        await checkDay(page, OKADA.staff.id, effective, title, true, '月曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(10), title, true, '木曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(14), title, false, '月曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(21), title, true, '月曜')

        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${effective}（新しい規則の最初の回）を開く`,
          async () => {
            await expect
              .poll(() =>
                googleInstanceDates(
                  request,
                  OKADA.calendarId,
                  title,
                  effective,
                  fromNextMonday(28),
                ),
              )
              .toEqual(expected)
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${effective}`,
            )
          },
        )
        await check(
          page,
          `calendarpit の ${effective}（月曜）に「${title}」が出る。calendarpit の Calendar API が返す ${effective} から 4 週の回は ${expected.join('、')} で、buddy と同じ`,
          async () => {
            expect(
              await googleInstanceDates(
                request,
                OKADA.calendarId,
                title,
                effective,
                fromNextMonday(28),
              ),
            ).toEqual(expected)
            await expect(calendarpitEvent(page, title)).toBeVisible()
          },
        )
      } finally {
        for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
          if (event.summary === title) await deleteGoogleEvent(request, OKADA.calendarId, event.id)
        }
      }
    })
  })
})
