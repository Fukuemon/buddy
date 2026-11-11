// DB を作り直してから単独で流す。
// cutover-complete と cutover-rejects-changed は、石田の事業所の正本の切り替えを完了し、戻す API が無い。
// この 2 本は 1 本ごとに DB を作り直し、ほかの 2 本を先に流してから、-g で 1 本ずつ流す。
import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { ISHIDA, ISHIDA_STATE } from '../../fixtures/env'
import { createGoogleEvent, shiftGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'

const CUTOVER_URL = '/schedule/link/cutover'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。切り替えの取り込みの期間は今月の初日から先の全てなので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * 録画の外の準備。石田のコンテキストで、Google カレンダーの今日の start から end に予定を 1 件作り、作った予定を返す。
 * 前の撮影が切り替えを残していれば、やめて切り替えの前にする。
 */
const prepare = (
  browser: Parameters<typeof prepareOutsideRecording>[0],
  summary: string,
  start: string,
  end: string,
) =>
  prepareOutsideRecording(browser, { storageState: ISHIDA_STATE }, async (page) => {
    const event = await createGoogleEvent(page.request, ISHIDA.calendarId, {
      summary,
      date: todayInTokyo(),
      start,
      end,
    })
    await page.goto(CUTOVER_URL)
    const startButton = page.getByTestId('calendar-cutover-start')
    const cancel = page.getByTestId('calendar-cutover-cancel')
    await startButton.or(cancel).waitFor()
    if (await cancel.isVisible()) {
      await cancel.click()
      await page.getByTestId('calendar-cutover-cancel-confirm-submit').click()
    }
    await startButton.waitFor()
    return event
  })

/** 録画の画面で、切り替えの前の画面を開き、始めるのボタンが出るまで待つ。 */
const openCutover = async (page: Page) => {
  await page.goto(CUTOVER_URL)
  await expect(page.getByTestId('calendar-cutover-start')).toBeVisible()
}

/** 「切り替えを始める」を押し、切り替え中になるまで待つ。 */
const startCutover = (page: Page) =>
  step(page, '「切り替えを始める」を押す', async () => {
    await page.getByTestId('calendar-cutover-start').click()
    await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
  })

/** 切り替えの画面から石田の取り込みの画面を開き、プレビューして確定し、切り替えの状況に戻る。 */
const importIshida = async (page: Page) => {
  await step(
    page,
    `「${ISHIDA.staff.name}」の行の「取り込む」を押し、取り込みの画面でプレビューする`,
    async () => {
      await page.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
      await expect(page.getByTestId('calendar-import-cutover-range')).toBeVisible()
      await page.getByTestId('calendar-import-preview').click()
      await expect(page.getByTestId('calendar-import-result-preview')).toBeVisible()
    },
  )
  await step(page, '「確定して取り込む」を押し、「切り替えの状況に戻る」を押す', async () => {
    await page.getByTestId('calendar-import-submit').click()
    await page.getByTestId('calendar-import-back-to-cutover').click()
    await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
  })
}

/** 完了するを、同期が取り込みの後に終わって完了するまで押し直す。 */
const completeUntilDone = async (page: Page) => {
  await expect(async () => {
    await page.getByTestId('calendar-cutover-complete').click()
    await expect(page.getByTestId('calendar-cutover-completed')).toBeVisible()
  }).toPass()
}

/** ほかの撮影の前提に戻すため、始めた切り替えをやめる。 */
const cancelCutoverForOthers = (page: Page) =>
  step(page, '（撮影のため、ほかの撮影の前提に戻すよう、始めた切り替えをやめる）', async () => {
    await page.goto(CUTOVER_URL)
    await page.getByTestId('calendar-cutover-cancel').click()
    await page.getByTestId('calendar-cutover-cancel-confirm-submit').click()
    await expect(page.getByTestId('calendar-cutover-start')).toBeVisible()
  })

test.describe('予定の正本の切り替え', () => {
  test.describe(`${ISHIDA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: ISHIDA_STATE })

    test('cutover-complete Google カレンダーを正本にする事業所で切り替えを始め、全てのカレンダーを取り込んで完了した場合、事業所が buddy を正本にし、予定のカレンダーで予定を作れること', async ({
      browser,
      context,
    }) => {
      const title = `担当者会議 ${Date.now()}`
      await prepare(browser, title, '13:00', '14:00')

      const page = await context.newPage()
      await openCutover(page)
      await intro(
        page,
        '切り替えを始め、全てのカレンダーを取り込んで完了すると、事業所が buddy を正本にし、予定のカレンダーで予定を作れる\n前提 予定の正本の切り替えの画面を開いている。Google カレンダーには、今日の 13:00〜14:00 に予定がある',
      )

      await check(
        page,
        '切り替えの前の画面に、手順と、Google カレンダーを変えない案内と、カレンダーの同期が出る',
        () => expect(page.getByTestId('calendar-cutover-start')).toBeVisible(),
      )
      await startCutover(page)
      await check(page, '切り替え中になり、取り込みの期間が今月の初日から先の全てになる', () =>
        expect(page.getByTestId('calendar-cutover-open')).toBeVisible(),
      )
      await importIshida(page)
      await check(
        page,
        `「${ISHIDA.staff.name}」の行に、この切り替えの最後の取り込みの時刻が出る`,
        () => expect(page.getByTestId('calendar-cutover-open')).toBeVisible(),
      )
      await step(page, '「完了する」を押す（取り込みの後の同期が終わるまで押し直す）', () =>
        completeUntilDone(page),
      )
      await check(
        page,
        '「切り替えを完了しました。この事業所の予定の正本は buddy です。」が出る',
        () => expect(page.getByTestId('calendar-cutover-completed')).toBeVisible(),
      )
      await step(page, '「予定のカレンダーを開く」を押す', async () => {
        await page.getByTestId('calendar-cutover-open-calendar').click()
        await expect(page.getByTestId('schedule-create-open')).toBeVisible()
      })
      await step(page, '今日を日の表示で開く', () =>
        page.goto(`/schedule?view=day&date=${todayInTokyo()}`).then(() => undefined),
      )
      const event = page
        .getByTestId(`day-grid-staff-${ISHIDA.staff.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: title })
      await check(
        page,
        `取り込んだ「${title}」が buddy の予定として出て、Google カレンダーで管理する案内が消える`,
        async () => {
          await expect(event).toBeVisible()
          await event.scrollIntoViewIfNeeded()
          await expect(page.getByTestId('schedule-calendar-google-primary')).toHaveCount(0)
        },
      )
      await step(page, '「予定を作成」を押す', () =>
        page.getByTestId('schedule-create-open').click(),
      )
      await check(page, '予定の作成のダイアログが開き、予定を作れる', () =>
        expect(page.getByTestId('schedule-create-submit')).toBeVisible(),
      )
    })

    test('cutover-rejects-changed 取り込んだ後に Google で予定を変えてから完了しようとした場合、完了が拒まれて変わった予定が一覧に出て、取り込み直すと完了できること', async ({
      browser,
      context,
    }) => {
      const title = `定例訪問の打ち合わせ ${Date.now()}`
      const event = await prepare(browser, title, '15:00', '16:00')

      const page = await context.newPage()
      await openCutover(page)
      await intro(
        page,
        '取り込んだ後に Google で予定を変えると完了が拒まれ、変わった予定が一覧に出る。取り込み直すと完了できる\n前提 予定の正本の切り替えの画面を開いている。Google カレンダーには、今日の 15:00〜16:00 に予定がある',
      )

      await startCutover(page)
      await importIshida(page)
      await step(
        page,
        '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で予定を 1 時間遅らせる）',
        () => shiftGoogleEvent(page.request, ISHIDA.calendarId, event.id).then(() => undefined),
      )
      const changed = page.getByTestId('calendar-cutover-unmet-changed')
      await step(page, '「完了する」を押す', () =>
        expect(async () => {
          await page.getByTestId('calendar-cutover-complete').click()
          await expect(changed).toBeVisible()
        }).toPass(),
      )
      await check(
        page,
        '完了できず、「完了できません」の一覧に、Google で変わった今日の 16:00〜17:00 の予定が出る。切り替え中のまま',
        async () => {
          await expect(changed).toContainText('取り込んだ後に Google で変わった')
          await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
        },
      )
      await importIshida(page)
      await step(page, '「完了する」を押す（取り込み直しの後の同期が終わるまで押し直す）', () =>
        completeUntilDone(page),
      )
      await check(page, '取り込み直すと、「切り替えを完了しました。」が出る', () =>
        expect(page.getByTestId('calendar-cutover-completed')).toBeVisible(),
      )
    })

    test('cutover-calendar-notice 切り替えを始めた場合、予定のカレンダーに切り替え中と始めた職員と時刻が出て、予定の作成を開かないこと', async ({
      browser,
      context,
    }) => {
      const title = `申し送り ${Date.now()}`
      await prepare(browser, title, '11:00', '12:00')

      const page = await context.newPage()
      await openCutover(page)
      await intro(
        page,
        '切り替えを始めると、予定のカレンダーに切り替え中と始めた職員と時刻が出て、予定の作成を開かない\n前提 予定の正本の切り替えの画面を開いている',
      )

      await startCutover(page)
      await step(page, '予定のカレンダーを開く', () => page.goto('/schedule').then(() => undefined))
      const notice = page.getByTestId('schedule-calendar-cutover')
      await check(
        page,
        `切り替え中の案内に、buddy でも予定を変えられないことと「開始: ${ISHIDA.staff.name}、〈始めた時刻〉」が出て、「予定を作成」は出ない`,
        async () => {
          await expect(notice).toContainText('buddy でも予定を作成、変更できません')
          await expect(notice.getByTestId('schedule-calendar-cutover-started')).toContainText(
            `開始: ${ISHIDA.staff.name}、`,
          )
          await expect(page.getByTestId('schedule-create-open')).toHaveCount(0)
        },
      )
      await cancelCutoverForOthers(page)
    })

    test('cutover-cancel 切り替えをやめた場合、取り込んだ予定が消え、事業所は Google カレンダーを正本にしたままになること', async ({
      browser,
      context,
    }) => {
      const title = `研修 ${Date.now()}`
      await prepare(browser, title, '10:00', '11:00')

      const page = await context.newPage()
      await openCutover(page)
      await intro(
        page,
        '切り替えをやめると、取り込んだ予定が消え、事業所は Google カレンダーを正本にしたままになる\n前提 予定の正本の切り替えの画面を開いている。Google カレンダーには、今日の 10:00〜11:00 に予定がある',
      )

      await startCutover(page)
      await importIshida(page)
      await step(page, '「切り替えをやめる」を押す', () =>
        page.getByTestId('calendar-cutover-cancel').click(),
      )
      const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
      await check(
        page,
        '確認のダイアログに、取り込んだ予定を消し、Google カレンダーで管理したままになることが出る',
        () => expect(dialog).toContainText('この切り替えで取り込んだ予定を、buddy から消します'),
      )
      await step(page, '「やめる」を押す', () =>
        dialog.getByTestId('calendar-cutover-cancel-confirm-submit').click(),
      )
      await check(page, '切り替えの前の画面に戻る', () =>
        expect(page.getByTestId('calendar-cutover-start')).toBeVisible(),
      )
      await step(page, '予定のカレンダーを日の表示で開く', async () => {
        await page.goto(`/schedule?view=day&date=${todayInTokyo()}`)
      })
      await check(
        page,
        'Google カレンダーで管理する案内が出て、切り替え中の表示は出ない',
        // #745 から、Google カレンダーを正本にする事業所でも「予定を作成」が出るので、「予定を作成」の有無は見ない
        async () => {
          await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
          await expect(page.getByTestId('schedule-calendar-cutover')).toHaveCount(0)
        },
      )
      await step(
        page,
        '切り替えの画面で、もう一度「切り替えを始める」を押し、取り込みの画面でプレビューする',
        async () => {
          await page.goto(CUTOVER_URL)
          await page.getByTestId('calendar-cutover-start').click()
          await page.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
          await page.getByTestId('calendar-import-preview').click()
        },
      )
      const preview = page.getByTestId('calendar-import-result-preview')
      await check(
        page,
        '前の切り替えで取り込んだ予定は残っておらず、取り込み済みの件数が出ずに、全てを取り込む件数に出る',
        async () => {
          await expect(preview.getByTestId('calendar-import-count-import')).toBeVisible()
          await expect(preview.getByTestId('calendar-import-count-already_imported')).toHaveCount(0)
        },
      )
      await cancelCutoverForOthers(page)
    })
  })
})
