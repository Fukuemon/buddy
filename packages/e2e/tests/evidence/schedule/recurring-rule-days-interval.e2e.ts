import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, LOGIN_EMAIL, LOGIN_STAFF, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { deleteGoogleEvent, listGoogleEvents } from '../../fixtures/googleCalendar'
import { createWeeklyNormalSchedule, newScheduleId } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { fieldNote } from '../../selectors/formField'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`
const OKADA_ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`
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

/** 日の表示で title の予定の詳細を開き、「編集」のメニューの「繰り返しを変更」を押して、「カスタム…」を選ぶ。 */
const openCustomRecurrence = async (page: Page, staffId: string, title: string) => {
  const event = dayEvent(page, staffId, title)
  await event.scrollIntoViewIfNeeded()
  await event.click()
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-detail-edit-recurrence').click()
  await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
  await page.getByTestId('recurring-rule-preset').selectOption('custom')
}

/** 間隔の欄に value を入れる。 */
const fillInterval = (page: Page, value: string) =>
  page.getByTestId('recurring-rule-interval').fill(value)

/** ログインし、staff の start からの毎週の通常の予定（10:00〜11:00）を予定の API で作る。 */
const prepareWeekly =
  (title: string, start: string, email: string, staff: { id: string }, facilityId: string) =>
  async (page: Page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, email)
    const token = await issueAccessToken(page.request, email)
    const created = await createWeeklyNormalSchedule(page.request, token, facilityId, {
      id: newScheduleId(),
      staffId: staff.id,
      title,
      date: start,
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
  test.describe('規則の欄の間隔と複数の曜日', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}隔週の月曜と木曜の規則で「カスタム…」を選んだ場合、間隔と、選んだ全ての曜日が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-custom-days-interval',
            title:
              '隔週の月曜と木曜の規則で「カスタム…」を選ぶと、改修後は間隔 2 と、月曜と木曜の両方を選んだ曜日の欄が出て、曜日を足せる',
            actor: 'ログインなし（Storybook の story）',
            variant,
          },
          async (page) => {
            await page.goto(BIWEEKLY_DAYS_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(BIWEEKLY_DAYS_URL)
            await shiftStory(page)
            await expect(page.getByTestId('recurring-rule-preset')).toBeVisible()
            await step(
              '繰り返しの欄（Storybook の RecurringRuleFields の BiweeklyDays）で、隔週の月曜と木曜の規則を 2026-10-22（木曜）の回から開いている（架空のデータ）',
            )
            await step('繰り返しで「カスタム…」を選ぶ')
            await page.getByTestId('recurring-rule-preset').selectOption('custom')
            await expect(page.getByTestId('recurring-rule-day-of-week-1')).toBeChecked()
            await check('繰り返す、間隔、曜日の欄と、選んでいる曜日')
            await step('曜日の「金」を押す')
            await page.getByTestId('recurring-rule-day-of-week-5').click()
            await expect(page.getByTestId('recurring-rule-day-of-week-5')).toBeChecked()
            await check('「金」を押した後の、選んでいる曜日')
          },
        )
      })
    }

    // 改修前は複数の曜日と間隔を選べないので、改修後だけを撮る
    for (const variant of EVIDENCE_VARIANTS.filter(({ name }) => name !== 'before')) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}毎週月曜の繰り返しの予定の回から月曜と木曜にした場合、その日以降に月曜と木曜の回が出て、前の回は変わらないこと`, async ({
        browser,
      }) => {
        const title = `週 2 回の定例 ${Date.now()}`
        const start = fromNextMonday(0)
        const effective = fromNextMonday(7)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-days-buddy-primary',
            title:
              '毎週月曜の繰り返しの予定の回から「繰り返しを変更」で月曜と木曜にすると、その日以降に月曜と木曜の両方の回が出て、その日より前の回は変わらない',
            actor: ACTOR,
            variant,
          },
          prepareWeekly(title, start, LOGIN_EMAIL, LOGIN_STAFF, STAFF_FORM.facilityId),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, effective)
            await step(
              `${start} から毎週月曜 10:00〜11:00 の「${title}」を作ってある。${effective}（月曜）の回を開く`,
            )
            await openCustomRecurrence(page, LOGIN_STAFF.id, title)
            await step('「繰り返しを変更」の「カスタム…」で、曜日の「木」を押す')
            await page.getByTestId('recurring-rule-day-of-week-4').check()
            await expect(page.getByTestId('recurring-rule-day-of-week-1')).toBeChecked()
            await check('曜日に月曜と木曜を選んでいる')
            await step('「保存」を押す')
            await page.getByTestId('schedule-recurrence-submit').click()
            await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()

            await checkDay(page, check, LOGIN_STAFF.id, effective, title, true, '月曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(10), title, true, '木曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(14), title, true, '月曜')
            await checkDay(page, check, LOGIN_STAFF.id, start, title, true, '月曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(3), title, false, '木曜')
          },
        )
      })

      test(`${prefix}毎週火曜の繰り返しの予定の回から間隔を 2 にした場合、開いた回の週から 2 週ごとの火曜に回が出ること`, async ({
        browser,
      }) => {
        const title = `隔週の定例 ${Date.now()}`
        const start = fromNextMonday(1)
        const effective = fromNextMonday(8)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-interval-buddy-primary',
            title:
              '毎週火曜の繰り返しの予定の回から「繰り返しを変更」で間隔を 2 にすると、開いた回の週から 2 週ごとの火曜に回が出て、間の週には出ない',
            actor: ACTOR,
            variant,
          },
          prepareWeekly(title, start, LOGIN_EMAIL, LOGIN_STAFF, STAFF_FORM.facilityId),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, effective)
            await step(
              `${start} から毎週火曜 10:00〜11:00 の「${title}」を作ってある。${effective}（火曜）の回を開く`,
            )
            await openCustomRecurrence(page, LOGIN_STAFF.id, title)
            await step('「繰り返しを変更」の「カスタム…」で、間隔に 2 を入れる')
            await fillInterval(page, '2')
            await expect(page.getByTestId('recurring-rule-frequency')).toContainText('隔週')
            await check('間隔が 2 になり、繰り返すが「隔週」になる')
            await step('「保存」を押す')
            await page.getByTestId('schedule-recurrence-submit').click()
            await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()

            await checkDay(page, check, LOGIN_STAFF.id, effective, title, true, '火曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(15), title, false, '火曜')
            await checkDay(page, check, LOGIN_STAFF.id, fromNextMonday(22), title, true, '火曜')
            await checkDay(page, check, LOGIN_STAFF.id, start, title, true, '火曜')
          },
        )
      })

      test(`${prefix}曜日を 1 つも選ばずに保存しようとした場合、曜日を選ぶ必要があることが分かり、保存されないこと`, async ({
        browser,
      }) => {
        const title = `曜日の確認の定例 ${Date.now()}`
        const start = fromNextMonday(0)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-days-required',
            title:
              '「繰り返しを変更」の「カスタム…」で曜日を全て外して「保存」を押すと、曜日を選ぶことを促す文が出て、保存されない',
            actor: ACTOR,
            variant,
          },
          prepareWeekly(title, start, LOGIN_EMAIL, LOGIN_STAFF, STAFF_FORM.facilityId),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, start)
            await step(`${start} から毎週月曜の「${title}」を作ってある。${start} の回を開く`)
            await openCustomRecurrence(page, LOGIN_STAFF.id, title)
            await step('「繰り返しを変更」の「カスタム…」で、曜日の「月」を外して「保存」を押す')
            await page.getByTestId('recurring-rule-day-of-week-1').uncheck()
            await page.getByTestId('schedule-recurrence-submit').click()
            await expect(
              fieldNote(
                page.getByTestId('schedule-recurrence-modal'),
                '曜日を 1 つ以上選んでください',
              ),
            ).toBeVisible()
            await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
            await check(
              '曜日の欄の下に「曜日を 1 つ以上選んでください」が出て、モーダルが開いたまま',
            )
            await step('「キャンセル」を押し、変更を破棄して閉じ、同じ日の表示を開き直す')
            page.once('dialog', (dialog) => void dialog.accept())
            await page.getByTestId('schedule-recurrence-cancel').click()
            await checkDay(page, check, LOGIN_STAFF.id, start, title, true, '月曜')
          },
        )
      })

      test(`${prefix}間隔に 0 か 53 を入れて保存しようとした場合、間隔の範囲が分かり、保存されないこと`, async ({
        browser,
      }) => {
        const title = `間隔の確認の定例 ${Date.now()}`
        const start = fromNextMonday(0)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-interval-range',
            title:
              '「繰り返しを変更」の「カスタム…」で間隔に 0 か 53 を入れて「保存」を押すと、1〜52 で入れることを促す文が出て、保存されない',
            actor: ACTOR,
            variant,
          },
          prepareWeekly(title, start, LOGIN_EMAIL, LOGIN_STAFF, STAFF_FORM.facilityId),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, start)
            await step(`${start} から毎週月曜の「${title}」を作ってある。${start} の回を開く`)
            await openCustomRecurrence(page, LOGIN_STAFF.id, title)
            const message = fieldNote(
              page.getByTestId('schedule-recurrence-modal'),
              '間隔は 1〜52 の週の数で入力してください',
            )
            await step('「繰り返しを変更」の「カスタム…」で、間隔に 0 を入れて「保存」を押す')
            await fillInterval(page, '0')
            await page.getByTestId('schedule-recurrence-submit').click()
            await expect(message).toBeVisible()
            await check('間隔が 0 のとき、間隔の欄の下に範囲の文が出て、モーダルが開いたまま')
            await step('間隔に 53 を入れて「保存」を押す')
            await fillInterval(page, '53')
            await page.getByTestId('schedule-recurrence-submit').click()
            await expect(message).toBeVisible()
            await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
            await check('間隔が 53 のときも、範囲の文が出て、モーダルが開いたまま')
          },
        )
      })

      test(`${prefix}Google カレンダーを正本にする事業所で、毎週月曜の繰り返しの予定を隔週の月曜と木曜に変えた場合、Google カレンダーにも同じ日の回が出ること`, async ({
        browser,
        request,
      }) => {
        const title = `隔週 2 回の定例 ${Date.now()}`
        const start = fromNextMonday(0)
        const effective = fromNextMonday(7)
        const expected = [effective, fromNextMonday(10), fromNextMonday(21), fromNextMonday(24)]
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-days-interval-google-primary',
            title:
              'Google カレンダーを正本にする事業所で、毎週月曜の繰り返しの予定の回から隔週の月曜と木曜に変えると、Google カレンダー（calendarpit）にも buddy と同じ日に回が出る',
            actor: OKADA_ACTOR,
            variant,
          },
          prepareWeekly(title, start, OKADA.email, OKADA.staff, OKADA.facilityId),
          async ({ page, step, check }) => {
            try {
              await openDay(page, OKADA.staff.id, effective)
              await step(
                `${start} から毎週月曜の「${title}」を ${OKADA.staff.name} の Google カレンダーに作ってある。${effective}（月曜）の回を開く`,
              )
              await openCustomRecurrence(page, OKADA.staff.id, title)
              await step(
                '「繰り返しを変更」の「カスタム…」で、間隔に 2 を入れ、曜日の「木」を押して「保存」を押す',
              )
              await fillInterval(page, '2')
              await page.getByTestId('recurring-rule-day-of-week-4').check()
              await page.getByTestId('schedule-recurrence-submit').click()
              await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()

              await checkDay(page, check, OKADA.staff.id, effective, title, true, '月曜')
              await checkDay(page, check, OKADA.staff.id, fromNextMonday(10), title, true, '木曜')
              await checkDay(page, check, OKADA.staff.id, fromNextMonday(14), title, false, '月曜')
              await checkDay(page, check, OKADA.staff.id, fromNextMonday(21), title, true, '月曜')

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
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${fromNextMonday(10)} を開く`,
              )
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${fromNextMonday(10)}`,
              )
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await check(
                `calendarpit の ${fromNextMonday(10)}（木曜）に「${title}」が出る。${effective} から 4 週の回は ${expected.join('、')} で、buddy と同じ`,
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
