import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { ISHIDA, ISHIDA_STATE, SCHEDULE_URL } from '../../fixtures/env'
import { createGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'

const CUTOVER_URL = '/schedule/link/cutover'
const CUTOVER_MESSAGE =
  '予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。'

type Browser = Parameters<typeof prepareOutsideRecording>[0]

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 切り替えの画面を開き、切り替え中（open が true）か切り替えの前（false）にする。前の撮影が残した状態は、やめるか始めるかで合わせる。 */
const setCutover = async (page: Page, open: boolean) => {
  await page.goto(CUTOVER_URL)
  const startButton = page.getByTestId('calendar-cutover-start')
  const cancel = page.getByTestId('calendar-cutover-cancel')
  await startButton.or(cancel).waitFor()
  if (open && (await startButton.isVisible())) {
    await startButton.click()
    await cancel.waitFor()
  }
  if (!open && (await cancel.isVisible())) {
    await cancel.click()
    await page.getByTestId('calendar-cutover-cancel-confirm-submit').click()
    await startButton.waitFor()
  }
}

/**
 * 録画の外の準備。石田のログインの状態で、石田の Google カレンダーに明日から毎週の繰り返しの予定を作り、同期が写した明日の回の ID を返す。
 * 回の ID は、予定の一覧（listSchedules）から読む。その後に、切り替えを open の状態にする。
 */
const prepare = (browser: Browser, open: boolean) =>
  prepareOutsideRecording(browser, { storageState: ISHIDA_STATE }, async (page) => {
    const title = `週の定例 ${Date.now()}`
    const date = daysFromToday(1)
    // 前の撮影が切り替えを残していると、同期が写した予定を読めても、切り替えの前の状態で開けないので、先に切り替えをやめる
    await setCutover(page, false)
    await createGoogleEvent(page.request, ISHIDA.calendarId, {
      summary: title,
      date,
      start: '10:00',
      end: '11:00',
      recurrence: ['RRULE:FREQ=WEEKLY'],
    })
    const token = await issueAccessToken(page.request, ISHIDA.email)
    let scheduleId = ''
    // 同期は別の処理が読むので、予定の一覧に回が出るまで読み直す
    await expect(async () => {
      const res = await page.request.get(
        `${SCHEDULE_URL}/v1/facilities/${ISHIDA.facilityId}/schedules`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { date_from: date, date_to: daysFromToday(2) },
        },
      )
      expect(res.ok()).toBe(true)
      const listed = (await res.json()) as { schedules: { id: string; title: string | null }[] }
      scheduleId = listed.schedules.find((s) => s.title === title)?.id ?? ''
      expect(scheduleId).not.toBe('')
    }).toPass()
    await setCutover(page, open)
    return { scheduleId, date, title }
  })

/** 録画の最初の画面として、date の日の表示を開く。直に開く URL は、この後の step で開く。 */
const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${ISHIDA.staff.id}`)).toBeVisible()
}

test.describe('予定の正本を切り替えている間に、予定を変える画面の URL を直に開いたとき', () => {
  test.describe(`${ISHIDA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: ISHIDA_STATE })

    test('cutover-recurrence-not-open 切り替えていない事業所で繰り返しの変更の URL を開いた場合、規則の欄を出すこと', async ({
      browser,
      context,
    }) => {
      const { scheduleId, date, title } = await prepare(browser, false)

      const page = await context.newPage()
      await openDay(page, date)
      await intro(
        page,
        `切り替えていない事業所で、繰り返しの変更の URL を開くと、規則の欄を出す\n前提 予定の正本の切り替えを始めていない。${date} の日の表示に、毎週の予定「${title}」の回がある`,
      )

      await step(page, `「${title}」の ${date} の回の繰り返しの変更の URL を直に開く`, async () => {
        await page.goto(`/schedule/${scheduleId}/recurrence?view=day&date=${date}`)
      })
      await check(page, '規則の欄と保存のボタンが出る', async () => {
        await expect(page.getByTestId('recurring-rule-preset')).toBeVisible()
        await expect(page.getByTestId('schedule-recurrence-submit')).toBeVisible()
      })
    })

    test('cutover-recurrence-after-open 繰り返しの変更を開いた後に切り替えが始まり保存を押した場合、保存の失敗の状態にし切り替え中の文を出すこと', async ({
      browser,
      context,
    }) => {
      const { scheduleId, date, title } = await prepare(browser, false)

      const page = await context.newPage()
      await openDay(page, date)
      await intro(
        page,
        `繰り返しの変更を開いた後に切り替えが始まり、保存を押すと、保存の失敗の状態にし、切り替え中の文を出す\n前提 予定の正本の切り替えを始めていない。${date} の日の表示に、毎週の予定「${title}」の回がある`,
      )

      await step(page, `「${title}」の ${date} の回の繰り返しの変更を開く`, async () => {
        await page.goto(`/schedule/${scheduleId}/recurrence?view=day&date=${date}`)
      })
      const preset = page.getByTestId('recurring-rule-preset')
      await step(page, '繰り返しを「毎月」の日にちの選択肢に変える', async () => {
        await preset.selectOption('monthly-day')
      })
      // 別のタブは録画しないコンテキストに開く。録画するコンテキストに開くと、collect.mjs がそのタブの動画を拾う
      await step(page, '撮影のため、同じ職員が開いた別のタブで、予定の正本の切り替えを始める', () =>
        prepareOutsideRecording(browser, { storageState: ISHIDA_STATE }, (other) =>
          setCutover(other, true),
        ),
      )
      await step(page, 'この画面で「保存」を押す', () =>
        page.getByTestId('schedule-recurrence-submit').click(),
      )
      await check(
        page,
        `入力を残したまま、規則の欄の下に「${CUTOVER_MESSAGE}」が出る`,
        async () => {
          await expect(page.getByTestId('schedule-recurrence-modal')).toContainText(CUTOVER_MESSAGE)
          await expect(preset).toHaveValue('monthly-day')
        },
      )
    })

    // 改修前は規則の欄が出て、保存の後に文が出る別の流れになるので、改修前と比べない
    test('cutover-recurrence-direct-url 切り替えている間に繰り返しの変更の URL を直に開いた場合、規則の欄を出さずに切り替え中の文を出すこと', async ({
      browser,
      context,
    }) => {
      const { scheduleId, date, title } = await prepare(browser, true)

      const page = await context.newPage()
      await openDay(page, date)
      await intro(
        page,
        `切り替えている間に繰り返しの変更の URL を直に開くと、規則の欄と保存のボタンを出さず、切り替え中の文と閉じるボタンを出す\n前提 予定の正本の切り替えを始めている。${date} の日の表示に、毎週の予定「${title}」の回がある`,
      )

      await step(page, `「${title}」の ${date} の回の繰り返しの変更の URL を直に開く`, async () => {
        await page.goto(`/schedule/${scheduleId}/recurrence?view=day&date=${date}`)
      })
      await check(
        page,
        `規則の欄と保存のボタンが出ず、「${CUTOVER_MESSAGE}」と右上の閉じるボタンが出る`,
        async () => {
          await expect(page.getByTestId('schedule-recurrence-cutover')).toContainText(
            CUTOVER_MESSAGE,
          )
          await expect(page.getByTestId('recurring-rule-preset')).toHaveCount(0)
          await expect(page.getByTestId('schedule-recurrence-submit')).toHaveCount(0)
          await expect(page.getByTestId('modal-close')).toBeVisible()
        },
      )
    })

    // 改修前はフォームが出て、ここで流れが分かれるので、改修前と比べない
    test('cutover-edit-direct-url 切り替えている間に予定の編集の URL を直に開いた場合、フォームを出さずに切り替え中の文を出すこと', async ({
      browser,
      context,
    }) => {
      const { scheduleId, date, title } = await prepare(browser, true)

      const page = await context.newPage()
      await openDay(page, date)
      await intro(
        page,
        `切り替えている間に予定の編集の URL を直に開くと、フォームと保存のボタンを出さず、切り替え中の文と閉じるボタンを出す\n前提 予定の正本の切り替えを始めている。${date} の日の表示に、毎週の予定「${title}」の回がある`,
      )

      await step(page, `「${title}」の ${date} の回の予定の編集の URL を直に開く`, async () => {
        await page.goto(`/schedule/${scheduleId}/edit?view=day&date=${date}`)
      })
      await check(
        page,
        `フォームと保存のボタンが出ず、「${CUTOVER_MESSAGE}」と右上の閉じるボタンが出る`,
        async () => {
          await expect(page.getByTestId('schedule-edit-cutover')).toContainText(CUTOVER_MESSAGE)
          await expect(page.getByTestId('schedule-form')).toHaveCount(0)
          await expect(page.getByTestId('schedule-edit-submit')).toHaveCount(0)
          await expect(page.getByTestId('modal-close')).toBeVisible()
        },
      )
    })
  })
})
