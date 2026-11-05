import { expect, test, type Page } from '@playwright/test'

import { ISHIDA, ISHIDA_STATE } from '../../fixtures/env'
import { createGoogleEvent, shiftGoogleEvent } from '../../fixtures/googleCalendar'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。切り替えの取り込みの期間は今月の初日から先の全てなので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const CUTOVER_URL = '/schedule/link/cutover'

/**
 * 切り替えの画面を開く。前の実行が切り替えを残していれば、やめてから戻る。
 * 切り替えの前の状態（始めるのボタン）が出るまで待つ。
 */
const openNotStarted = async (page: Page) => {
  await page.goto(CUTOVER_URL)
  const start = page.getByTestId('calendar-cutover-start')
  const cancel = page.getByTestId('calendar-cutover-cancel')
  await start.or(cancel).waitFor()
  if (await cancel.isVisible()) await cancelCutover(page)
  await start.waitFor()
}

/** 切り替えの画面で切り替えを始め、切り替え中の表示が出るまで待つ。 */
const startCutover = async (page: Page) => {
  await page.getByTestId('calendar-cutover-start').click()
  await page.getByTestId('calendar-cutover-open').waitFor()
}

/** 切り替えをやめる。確認のダイアログの文言を見てから、やめるを押し、始めるのボタンが出るまで待つ。 */
const cancelCutover = async (page: Page) => {
  await page.getByTestId('calendar-cutover-cancel').click()
  const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
  await expect(dialog).toContainText('この切り替えで取り込んだ予定を、buddy から消します')
  await dialog.getByTestId('calendar-cutover-cancel-confirm-submit').click()
  await page.getByTestId('calendar-cutover-start').waitFor()
}

/** 切り替えの画面から石田の取り込みの画面を開き、プレビューの結果が出るまで待つ。 */
const previewIshida = async (page: Page) => {
  await page.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
  await expect(page.getByTestId('calendar-import-cutover-range')).toBeVisible()
  await page.getByTestId('calendar-import-preview').click()
  return page.getByTestId('calendar-import-result-preview')
}

/** プレビューの結果を確定し、切り替えの状況に戻る。 */
const submitAndBack = async (page: Page) => {
  await page.getByTestId('calendar-import-submit').click()
  await page.getByTestId('calendar-import-back-to-cutover').click()
  await page.getByTestId('calendar-cutover-open').waitFor()
}

// シードの 4 つ目の事業所は Google カレンダーを予定の正本にし（google_primary）、石田のカレンダーを結び付けてある。
// 切り替えを完了すると事業所は buddy を正本にして戻せないので、やめる確認を先に、完了を最後に、順に流す（ADR-0029）。
test.describe('予定の正本の切り替え', () => {
  test.use({ storageState: ISHIDA_STATE })
  test.describe.configure({ mode: 'serial' })

  test('切り替えをやめた場合、取り込んだ予定が消え、事業所は Google カレンダーを正本にしたままであること', async ({
    page,
    request,
  }) => {
    await createGoogleEvent(request, ISHIDA.calendarId, {
      summary: `E2E のやめる予定 ${Date.now()}`,
      date: todayInTokyo(),
      start: '06:00',
      end: '07:00',
    })
    await openNotStarted(page)
    await startCutover(page)
    await expect(await previewIshida(page)).toBeVisible()
    await submitAndBack(page)
    await expect(page.getByTestId(`calendar-cutover-import-${ISHIDA.staff.id}`)).not.toHaveText(
      'まだ取り込んでいない',
    )

    await cancelCutover(page)
    await page.goto('/schedule')
    await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
    await expect(page.getByTestId('schedule-calendar-cutover')).toHaveCount(0)

    // 始め直すと、前の切り替えで取り込んだ予定は残っていないので、取り込み済みに数えずに、全てを取り込む予定に数える
    await openNotStarted(page)
    await startCutover(page)
    const preview = await previewIshida(page)
    await expect(preview.getByTestId('calendar-import-count-import')).toBeVisible()
    await expect(preview.getByTestId('calendar-import-count-already_imported')).toHaveCount(0)
    await page.goto(CUTOVER_URL)
    await cancelCutover(page)
  })

  test('取り込んだ後に Google で予定を変えて完了しようとした場合、完了が拒まれて変わった予定が一覧に出て、取り込み直すと完了できること', async ({
    page,
    request,
  }) => {
    const title = `E2E の切り替えの予定 ${Date.now()}`
    const event = await createGoogleEvent(request, ISHIDA.calendarId, {
      summary: title,
      date: todayInTokyo(),
      start: '07:00',
      end: '08:00',
    })
    await openNotStarted(page)
    await startCutover(page)
    await expect(page.getByTestId('calendar-cutover-no-edit')).toBeVisible()
    await page.goto('/schedule')
    await expect(page.getByTestId('schedule-calendar-cutover')).toContainText(
      '予定の正本を buddy に切り替えています',
    )
    await page.goto(CUTOVER_URL)
    await expect(await previewIshida(page)).toBeVisible()
    await submitAndBack(page)

    await shiftGoogleEvent(request, ISHIDA.calendarId, event.id)
    const changed = page.getByTestId('calendar-cutover-unmet-changed')
    // 同期が取り込みの後に終わるまでは、同期が古いことだけが出るので、変わった予定が出るまで完了し直す
    await expect(async () => {
      await page.getByTestId('calendar-cutover-complete').click()
      await expect(changed).toBeVisible()
    }).toPass()
    await expect(changed).toContainText(ISHIDA.staff.name)
    await expect(changed).toContainText('取り込んだ後に Google で変わった')
    await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()

    const preview = await previewIshida(page)
    await expect(preview.getByTestId('calendar-import-count-overwrite')).toContainText('1 件')
    await submitAndBack(page)
    // 取り込み直した後に同期が終わるまで、完了し直す
    await expect(async () => {
      await page.getByTestId('calendar-cutover-complete').click()
      await expect(page.getByTestId('calendar-cutover-completed')).toBeVisible()
    }).toPass()
  })

  test('全てのカレンダーを取り込んで完了した場合、事業所が buddy を正本にし、予定のカレンダーで予定を作れること', async ({
    page,
  }) => {
    await page.goto(CUTOVER_URL)
    await expect(page.getByTestId('calendar-cutover-buddy-primary')).toContainText(
      'この事業所の予定の正本は buddy です',
    )
    await page.goto(`/schedule?view=day&date=${todayInTokyo()}`)
    await expect(page.getByTestId('schedule-create-open')).toBeVisible()
    await expect(page.getByTestId('schedule-calendar-google-primary')).toHaveCount(0)
    // 取り込んだ予定は、buddy の予定として石田の列に出る
    await expect(
      page
        .getByTestId(`day-grid-staff-${ISHIDA.staff.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: 'E2E の切り替えの予定' })
        .first(),
    ).toBeVisible()
  })
})
