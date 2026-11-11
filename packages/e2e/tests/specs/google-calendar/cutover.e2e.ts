import { expect, test, type Page } from '@playwright/test'

import { todayInTokyo } from '../../fixtures/date'
import { ISHIDA, ISHIDA_STATE } from '../../fixtures/env'
import { createGoogleEvent, shiftGoogleEvent } from '../../fixtures/googleCalendar'

const CUTOVER_URL = '/schedule/link/cutover'

/**
 * 移行の画面を開く。前の実行が移行を残していれば、やめてから戻る。
 * 移行の前の状態（始めるのボタン）が出るまで待つ。
 */
const openNotStarted = async (page: Page) => {
  await page.goto(CUTOVER_URL)
  const start = page.getByTestId('calendar-cutover-start')
  const cancel = page.getByTestId('calendar-cutover-cancel')
  await start.or(cancel).waitFor()
  if (await cancel.isVisible()) await cancelCutover(page)
  await start.waitFor()
}

/** 移行の画面で移行を始め、移行中の表示が出るまで待つ。 */
const startCutover = async (page: Page) => {
  await page.getByTestId('calendar-cutover-start').click()
  await page.getByTestId('calendar-cutover-open').waitFor()
}

/** 移行をやめる。確認のダイアログの文言を見てから、やめるを押し、始めるのボタンが出るまで待つ。 */
const cancelCutover = async (page: Page) => {
  await page.getByTestId('calendar-cutover-cancel').click()
  const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
  await expect(dialog).toContainText('この移行で取り込んだ予定を、buddy から消します')
  await dialog.getByTestId('calendar-cutover-cancel-confirm-submit').click()
  await page.getByTestId('calendar-cutover-start').waitFor()
}

/** 移行の画面から石田の取り込みの画面を開き、プレビューの結果が出るまで待つ。 */
const previewIshida = async (page: Page) => {
  await page.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
  await expect(page.getByTestId('calendar-import-cutover-range')).toBeVisible()
  await page.getByTestId('calendar-import-preview').click()
  return page.getByTestId('calendar-import-result-preview')
}

/** プレビューの結果を確定し、移行の状況に戻る。 */
const submitAndBack = async (page: Page) => {
  await page.getByTestId('calendar-import-submit').click()
  await page.getByTestId('calendar-import-back-to-cutover').click()
  await page.getByTestId('calendar-cutover-open').waitFor()
}

// シードの 4 つ目の事業所は予定を Google カレンダーで管理し（google_primary）、石田のカレンダーを結び付けてある。
// 移行を完了すると事業所は予定を buddy で管理して戻せないので、やめる確認を先に、完了を最後に、順に流す（ADR-0031）。
test.describe('予定の管理を buddy に移す', () => {
  test.use({ storageState: ISHIDA_STATE })
  test.describe.configure({ mode: 'serial' })

  test('移行をやめた場合、取り込んだ予定が消え、事業所は予定を Google カレンダーで管理したままであること', async ({
    page,
    request,
  }) => {
    // 移行の取り込みの期間は今月の初日から先の全てなので、今日に予定を作る
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

    // 始め直すと、前の移行で取り込んだ予定は残っていないので、取り込み済みに数えずに、全てを取り込む予定に数える
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
    const title = `E2E の移行の予定 ${Date.now()}`
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
    const notice = page.getByTestId('schedule-calendar-cutover')
    await expect(notice).toContainText('予定の管理を buddy に移しています')
    await expect(notice).toContainText('buddy でも予定を作成、変更できません')
    await expect(notice.getByTestId('schedule-calendar-cutover-started')).toContainText(
      `開始: ${ISHIDA.staff.name}、`,
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

  test('全てのカレンダーを取り込んで完了した場合、事業所が予定を buddy で管理し、予定のカレンダーで予定を作れること', async ({
    page,
  }) => {
    await page.goto(CUTOVER_URL)
    await expect(page.getByTestId('calendar-cutover-buddy-primary')).toContainText(
      'この事業所は、予定を buddy で管理しています',
    )
    await page.goto(`/schedule?view=day&date=${todayInTokyo()}`)
    await expect(page.getByTestId('schedule-create-open')).toBeVisible()
    await expect(page.getByTestId('schedule-calendar-google-primary')).toHaveCount(0)
    // 取り込んだ予定は、buddy の予定として石田の列に出る
    await expect(
      page
        .getByTestId(`day-grid-staff-${ISHIDA.staff.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: 'E2E の移行の予定' })
        .first(),
    ).toBeVisible()
  })
})
