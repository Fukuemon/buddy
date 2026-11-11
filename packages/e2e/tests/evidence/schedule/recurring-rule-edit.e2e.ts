import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  CALENDARPIT_URL,
  HAYASHI,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OKADA,
  OKADA_STATE,
  TEAM_MEMBER,
} from '../../fixtures/env'
import { deleteGoogleEvent, listGoogleEvents } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import {
  createWeeklyNormalSchedule,
  newScheduleId,
  replaceOccurrence,
} from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { calendarpitEvent } from '../../selectors/calendarpit'

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** YYYY-MM-DD の、月の 1 日から 7 日ずつ区切った第何週か。 */
const weekOfMonth = (date: string) => Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1

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

/** 日の表示で title の予定を押して詳細を開き、「編集」を押す。 */
const openDetailEdit = async (page: Page, staffId: string, title: string) => {
  const event = dayEvent(page, staffId, title)
  await event.scrollIntoViewIfNeeded()
  await event.click()
  await page.getByTestId('schedule-detail-edit').click()
}

/** 日の表示で title の予定の詳細を開き、「編集」のメニューの「この予定を編集」を選んで、予定の編集を開く。 */
const openEdit = async (page: Page, staffId: string, title: string) => {
  await openDetailEdit(page, staffId, title)
  await page.getByTestId('schedule-detail-edit-occurrence').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
}

/** 日の表示で title の予定の詳細を開き、「編集」のメニューの「繰り返しを変更」を選ぶ。 */
const openRecurrenceChange = async (page: Page, staffId: string, title: string) => {
  await openDetailEdit(page, staffId, title)
  await page.getByTestId('schedule-detail-edit-recurrence').click()
  await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
}

/**
 * 繰り返しの変更で「カスタム…」を選び、毎週の曜日を day（1 が月曜）の 1 つにする。
 * 曜日の欄は足し外しするチェックボックスなので、ほかに選んだ曜日を外す。
 */
const chooseWeekday = async (page: Page, day: number) => {
  await page.getByTestId('recurring-rule-preset').selectOption('custom')
  await page.getByTestId(`recurring-rule-day-of-week-${day}`).check()
  for (let other = 1; other <= 7; other++) {
    const box = page.getByTestId(`recurring-rule-day-of-week-${other}`)
    if (other !== day && (await box.isChecked())) await box.uncheck()
  }
}

/** 録画の外の page で、青木 陽菜のトークンを取り、staff の start からの毎週の通常の予定（10:00〜11:00）を予定の API で作り、トークンと ID を返す。 */
const createWeekly = async (page: Page, title: string, start: string, staff: { id: string }) => {
  const token = await issueAccessToken(page.request, LOGIN_EMAIL)
  const created = await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
    staffId: staff.id,
    title,
    date: start,
  })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: string }
  return { token, id }
}

/** 録画の外で、青木 陽菜のコンテキストで prepare を行う。 */
const prepareAsAoki = <T>(
  browser: Parameters<typeof prepareOutsideRecording>[0],
  prepare: (page: Page) => Promise<T>,
) => prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, prepare)

/** calendarpit の calendarId の予定のうち、タイトルが title で、RRULE に rule を含む繰り返しの予定。 */
const findRecurringGoogleEvent = async (
  request: APIRequestContext,
  calendarId: string,
  title: string,
  rule: string,
) =>
  (await listGoogleEvents(request, calendarId)).find(
    (event) => event.summary === title && event.recurrence?.some((line) => line.includes(rule)),
  )

// 改修前は「編集」がメニューにならず、規則を変えられない。改修前は流れが違うので、どのテストも改修後だけを撮る
test.describe('予定の編集', () => {
  test.describe(`繰り返しの予定の規則の変更（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('recurring-rule-edit-buddy-primary buddy で管理する事業所で、毎週月曜の繰り返しの予定の回から「繰り返しを変更」で毎週火曜にした場合、その日以降が火曜に出て、前の回は変わらないこと', async ({
      browser,
      context,
    }) => {
      const title = `定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const tuesday = fromNextMonday(8)
      await prepareAsAoki(browser, (page) => createWeekly(page, title, start, LOGIN_STAFF))

      const page = await context.newPage()
      await openDay(page, LOGIN_STAFF.id, effective)
      await expect(dayEvent(page, LOGIN_STAFF.id, title)).toBeVisible()
      await intro(
        page,
        `buddy で管理する事業所で、毎週月曜の繰り返しの予定の回の「編集」のメニューから「繰り返しを変更」を選び、毎週火曜にすると、その日以降の回が火曜に出て、その日より前の回は月曜のまま\n前提 ${start} から毎週月曜 10:00〜11:00 の「${title}」を作ってある。${effective}（月曜）の日の表示を開いている`,
      )

      await step(page, '予定を押して詳細を開き、「編集」を押す', () =>
        openDetailEdit(page, LOGIN_STAFF.id, title),
      )
      await check(
        page,
        '「編集」の上に「この予定を編集」と「繰り返しを変更」のメニューが開く',
        async () => {
          await expect(page.getByTestId('schedule-detail-edit-occurrence')).toBeVisible()
          await expect(page.getByTestId('schedule-detail-edit-recurrence')).toBeVisible()
        },
      )

      await step(page, '「繰り返しを変更」を押す', () =>
        page.getByTestId('schedule-detail-edit-recurrence').click(),
      )
      await check(
        page,
        '繰り返しの変更のモーダルが開き、この回以降を変えることの説明と、今の「毎週 月曜日」が出る',
        async () => {
          await expect(page.getByTestId('schedule-recurrence-lead')).toBeVisible()
          await expect(page.getByTestId('recurring-rule-preset')).toHaveValue('weekly')
        },
      )

      await step(page, '繰り返しで「カスタム…」を選ぶ', async () => {
        await page.getByTestId('recurring-rule-preset').selectOption('custom')
      })
      await check(page, '同じモーダルの中に、頻度（毎週）と曜日の欄が開き、月曜を選んでいる', () =>
        expect(page.getByTestId('recurring-rule-day-of-week-1')).toBeChecked(),
      )

      await step(page, '曜日の「火」を押し、「月」を外して「保存」を押す', async () => {
        await page.getByTestId('recurring-rule-day-of-week-2').check()
        await page.getByTestId('recurring-rule-day-of-week-1').uncheck()
        await page.getByTestId('schedule-recurrence-submit').click()
      })
      await check(
        page,
        `予定のカレンダーの ${tuesday}（火曜）に戻り、「${title}」が出る`,
        async () => {
          await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
          await expect(dayEvent(page, LOGIN_STAFF.id, title)).toBeVisible()
        },
      )

      await step(page, `${effective}（月曜）の日の表示を開く`, () =>
        openDay(page, LOGIN_STAFF.id, effective),
      )
      await check(page, `${effective}（月曜）には「${title}」が出ない`, () =>
        expect(dayEvent(page, LOGIN_STAFF.id, title)).toHaveCount(0),
      )
      await step(page, `前の回の ${start}（月曜）の日の表示を開く`, () =>
        openDay(page, LOGIN_STAFF.id, start),
      )
      await check(page, `${start}（月曜）の回は変わらずに出る`, () =>
        expect(dayEvent(page, LOGIN_STAFF.id, title)).toBeVisible(),
      )
    })

    test('recurring-rule-edit-occurrence-only 繰り返しの予定の回で「この予定を編集」から時刻を変えて保存した場合、その回だけが変わること', async ({
      browser,
      context,
    }) => {
      const title = `佐藤さんの定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const next = fromNextMonday(7)
      await prepareAsAoki(browser, (page) => createWeekly(page, title, start, TEAM_MEMBER))

      const page = await context.newPage()
      await openDay(page, TEAM_MEMBER.id, start)
      await intro(
        page,
        `繰り返しの予定の回の「編集」から開始時間を変えて保存すると、その回だけが変わり、次の回は変わらない\n前提 ${start} から ${TEAM_MEMBER.name} の毎週月曜 10:00〜11:00 の「${title}」を作ってある。${start} の日の表示を開いている`,
      )

      await step(page, '予定を押して詳細を開き、「編集」のメニューの「この予定を編集」を押す', () =>
        openEdit(page, TEAM_MEMBER.id, title),
      )
      await check(page, 'この回の予定の編集が開く', () =>
        expect(page.getByTestId('schedule-form-modal')).toBeVisible(),
      )

      await step(
        page,
        '予定日時の開始時間を 14:00、終了時間を 15:00 にして「保存」を押す',
        async () => {
          await page.getByTestId('schedule-form-start-time').fill('14:00')
          await page.getByTestId('schedule-form-end-time').fill('15:00')
          await page.getByTestId('schedule-edit-submit').click()
        },
      )
      await check(page, '予定の詳細に戻り、日時が 14:00〜15:00 になっている', async () => {
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
        await expect(page.getByTestId('schedule-detail-modal')).toContainText('14:00')
      })

      await step(page, `次の回の ${next} の日の表示を開き、予定を押して詳細を開く`, async () => {
        await openDay(page, TEAM_MEMBER.id, next)
        await dayEvent(page, TEAM_MEMBER.id, title).click()
      })
      await check(page, `${next} の回は 10:00〜11:00 のまま`, () =>
        expect(page.getByTestId('schedule-detail-modal')).toContainText('10:00'),
      )
    })

    test('recurring-rule-edit-replaced 1 回だけ変えた回は単発の予定として扱い、その繰り返しの予定の規則を変えた場合、変えた回は残り、その元の日に新しい規則の回が出ないこと', async ({
      browser,
      context,
    }) => {
      const title = `林さんの定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const replacedDate = fromNextMonday(14)
      const movedTo = fromNextMonday(16)
      const week = weekOfMonth(replacedDate)
      await prepareAsAoki(browser, async (page) => {
        const prepared = await createWeekly(page, title, start, HAYASHI)
        const moved = await replaceOccurrence(
          page.request,
          prepared.token,
          prepared.id,
          replacedDate,
          {
            staffId: HAYASHI.id,
            title,
            date: movedTo,
          },
        )
        expect(moved.status()).toBe(201)
      })

      const page = await context.newPage()
      await openDay(page, HAYASHI.id, movedTo)
      await expect(dayEvent(page, HAYASHI.id, title)).toBeVisible()
      await intro(
        page,
        `1 回だけ水曜に移した回は単発の予定と同じ「編集」のボタンになる。その繰り返しの予定を、毎月第 ${week} 月曜に変えると、移した回は残り、移した元の月曜には新しい規則の回が出ない\n前提 ${start} から ${HAYASHI.name} の毎週月曜の「${title}」を作り、${replacedDate}（月曜）の回を ${movedTo}（水曜）に移してある。${movedTo} の日の表示に移した回が出ている`,
      )

      await step(page, '移した回を押して詳細を開く', () =>
        dayEvent(page, HAYASHI.id, title).click(),
      )
      await check(
        page,
        '移した回は単発の予定として扱い、「編集」はメニューにならず、単発の予定と同じボタンが出る',
        () => expect(page.getByTestId('schedule-detail-edit')).not.toHaveAttribute('aria-haspopup'),
      )

      await step(
        page,
        `${effective}（月曜）の回の詳細を開き、「編集」のメニューの「繰り返しを変更」を押す`,
        async () => {
          await openDay(page, HAYASHI.id, effective)
          await openRecurrenceChange(page, HAYASHI.id, title)
        },
      )

      await step(
        page,
        `繰り返しで「カスタム…」、頻度で「毎月」を選び、「曜日」を押して第 ${week}、月曜日にして「保存」を押す`,
        async () => {
          await page.getByTestId('recurring-rule-preset').selectOption('custom')
          await page.getByTestId('recurring-rule-frequency').selectOption('monthly')
          await page.getByTestId('recurring-rule-monthly-by-weekday').check()
          await page.getByTestId('recurring-rule-week-of-month').selectOption(String(week))
          await page.getByTestId('recurring-rule-monthly-day-of-week').selectOption('1')
          await page.getByTestId('schedule-recurrence-submit').click()
        },
      )
      await check(page, '保存でき、予定のカレンダーに戻る', () =>
        expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden(),
      )

      await step(
        page,
        `新しい規則が当たる ${replacedDate}（第 ${week} 月曜）の日の表示を開く`,
        () => openDay(page, HAYASHI.id, replacedDate),
      )
      await check(page, `${replacedDate} の ${HAYASHI.name} の列には、新しい規則の回が出ない`, () =>
        expect(dayEvent(page, HAYASHI.id, title)).toHaveCount(0),
      )
      await step(page, `移した先の ${movedTo}（水曜）の日の表示を開く`, () =>
        openDay(page, HAYASHI.id, movedTo),
      )
      await check(page, `${movedTo} に移した回は残る`, () =>
        expect(dayEvent(page, HAYASHI.id, title)).toBeVisible(),
      )
    })

    test('recurring-rule-edit-past 今日より前の回から「繰り返しを変更」で曜日を変えた場合、今日以降の回を変えることが分かり、今日より前の回は変わらないこと', async ({
      browser,
      context,
    }) => {
      const title = `定例 ${Date.now()}`
      const start = daysFromToday(-14)
      const past = daysFromToday(-7)
      const weekday = new Date(`${start}T00:00:00Z`).getUTCDay() || 7
      const nextWeekday = (weekday % 7) + 1
      await prepareAsAoki(browser, (page) => createWeekly(page, title, start, LOGIN_STAFF))

      const page = await context.newPage()
      await openDay(page, LOGIN_STAFF.id, past)
      await intro(
        page,
        `今日より前の回の「編集」のメニューから「繰り返しを変更」を選ぶと、今日以降の回を変えることを出し、曜日を変えて保存すると、今日より前の回は変わらない\n前提 ${start} から毎週の「${title}」を作ってある。今日より前の ${past} の日の表示を開いている`,
      )

      await step(page, '予定を押して詳細を開き、「編集」のメニューの「繰り返しを変更」を押す', () =>
        openRecurrenceChange(page, LOGIN_STAFF.id, title),
      )
      await check(
        page,
        '今日より前の回でも繰り返しの変更が開き、今日以降の回を変え、今日より前の回は変わらないことが出る',
        () =>
          expect(page.getByTestId('schedule-recurrence-lead')).toContainText(
            '今日より前の回は変わりません。',
          ),
      )

      await step(
        page,
        '繰り返しで「カスタム…」を選び、次の曜日を押して「保存」を押す',
        async () => {
          await chooseWeekday(page, nextWeekday)
          await page.getByTestId('schedule-recurrence-submit').click()
        },
      )
      await check(page, '保存でき、予定のカレンダーに戻る', () =>
        expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden(),
      )

      await step(page, `今日より前の ${past} の日の表示を開く`, () =>
        openDay(page, LOGIN_STAFF.id, past),
      )
      await check(page, `${past} の回は変わらずに出る`, () =>
        expect(dayEvent(page, LOGIN_STAFF.id, title)).toBeVisible(),
      )
    })
  })

  test.describe(`繰り返しの予定の規則の変更（${OKADA.staff.name}、Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('recurring-rule-edit-google-primary Google カレンダーを正本にする事業所で、毎週月曜の繰り返しの予定の回から「繰り返しを変更」で毎週火曜にした場合、Google カレンダーにも新しい規則が書かれ、画面に新しい回が出ること', async ({
      browser,
      context,
      request,
    }) => {
      const title = `定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const tuesday = fromNextMonday(8)
      await prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
        const token = await issueAccessToken(page.request, OKADA.email)
        const created = await createWeeklyNormalSchedule(page.request, token, OKADA.facilityId, {
          id: newScheduleId(),
          staffId: OKADA.staff.id,
          title,
          date: start,
        })
        expect(created.status()).toBe(201)
      })

      const page = await context.newPage()
      try {
        await openDay(page, OKADA.staff.id, effective)
        await expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible()
        await intro(
          page,
          `Google カレンダーを正本にする事業所で、毎週月曜の繰り返しの予定の回の「編集」のメニューから「繰り返しを変更」で毎週火曜にすると、calendarpit に火曜の繰り返しの予定ができ、予定のカレンダーが火曜の回を出す\n前提 ${start} から毎週月曜の「${title}」を ${OKADA.staff.name} の Google カレンダーに作ってある。${effective}（月曜）の日の表示を開いている`,
        )

        await step(
          page,
          '「編集」のメニューの「繰り返しを変更」を押し、「カスタム…」で曜日の「火」を押して「保存」を押す',
          async () => {
            await openRecurrenceChange(page, OKADA.staff.id, title)
            await chooseWeekday(page, 2)
            await page.getByTestId('schedule-recurrence-submit').click()
          },
        )
        await check(
          page,
          `予定のカレンダーの ${tuesday}（火曜）に戻り、「${title}」が出る`,
          async () => {
            await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
            await expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible()
          },
        )

        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${tuesday} を開く`,
          async () => {
            await expect
              .poll(
                async () =>
                  (await findRecurringGoogleEvent(request, OKADA.calendarId, title, 'BYDAY=TU')) !==
                  undefined,
              )
              .toBe(true)
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${tuesday}`,
            )
          },
        )
        await check(page, `${OKADA.calendarId} の ${tuesday}（火曜）に「${title}」が出る`, () =>
          expect(calendarpitEvent(page, title)).toBeVisible(),
        )

        await step(page, `予定のカレンダーで ${effective}（月曜）の日の表示を開く`, () =>
          openDay(page, OKADA.staff.id, effective),
        )
        await check(page, `${effective}（月曜）には「${title}」が出ない`, () =>
          expect(dayEvent(page, OKADA.staff.id, title)).toHaveCount(0),
        )
      } finally {
        for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
          if (event.summary === title) await deleteGoogleEvent(request, OKADA.calendarId, event.id)
        }
      }
    })
  })
})
