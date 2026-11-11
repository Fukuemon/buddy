// DB を作り直してから単独で流す。
// cutover-conflict-complete は、石田の事業所の移行を完了し、戻す API が無いので、ファイルの最後に置く。
import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { ISHIDA, ISHIDA_STATE } from '../../fixtures/env'
import { createGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { pageBody } from '../../selectors/page'

const CUTOVER_URL = '/schedule/link/cutover'
const NOT_OPEN_MESSAGE =
  'この移行は、ほかの画面で完了したか、やめています。画面を読み直してください。'
const STARTED_MESSAGE = 'この事業所では、ほかの画面で移行を始めています。画面を読み直してください。'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。移行の取り込みの期間は今月の初日から先の全てなので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * 録画の外の準備。石田のコンテキストで、移行の画面を、移行の前（open が false）か移行中（true）にする。
 * 前の撮影が残した状態は、やめるか始めるかで合わせる。
 * 取り込む予定が無いと完了の撮影で取り込めないので、Google カレンダーの今日に予定を 1 件作る。
 */
const prepare = (browser: Parameters<typeof prepareOutsideRecording>[0], open: boolean) =>
  prepareOutsideRecording(browser, { storageState: ISHIDA_STATE }, async (page) => {
    await createGoogleEvent(page.request, ISHIDA.calendarId, {
      summary: `申し送り ${Date.now()}`,
      date: todayInTokyo(),
      start: '15:00',
      end: '16:00',
    })
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
  })

/** 録画の画面で、移行の画面を開き、目印の要素が出るまで待つ。 */
const openCutover = async (page: Page, open: boolean) => {
  await page.goto(CUTOVER_URL)
  await expect(
    open ? page.getByTestId('calendar-cutover-cancel') : page.getByTestId('calendar-cutover-start'),
  ).toBeVisible()
}

/**
 * 同じ職員が開いた別のタブ。録画しない別のコンテキストに、同じログインの状態で開き、操作を終えたら閉じる。
 * 録画する page と同じコンテキストに開くと、別のタブの動画もテストに添付され、collect.mjs がそちらを mp4 にする。
 */
const inOtherTab = async (page: Page, action: (other: Page) => Promise<void>) => {
  const browser = page.context().browser()
  if (!browser) throw new Error('録画する page のブラウザを取れない')
  await prepareOutsideRecording(browser, { storageState: ISHIDA_STATE }, async (other) => {
    await other.goto(CUTOVER_URL)
    await action(other)
  })
}

/** 別のタブで移行をやめる。 */
const cancelInOtherTab = (page: Page) =>
  inOtherTab(page, async (other) => {
    await other.getByTestId('calendar-cutover-cancel').click()
    await other.getByTestId('calendar-cutover-cancel-confirm-submit').click()
    await other.getByTestId('calendar-cutover-start').waitFor()
  })

/**
 * 職員がほかのタブからこの画面のタブに戻ったときの出来事を送り、画面に移行の状況を読み直させる。
 * 録画のブラウザはタブを切り替えても戻ったときの出来事を送らないので、撮影のために送る。
 */
const returnToTab = (page: Page) =>
  page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })

/** やめる前の確認を開き、別のタブで移行をやめてから、確認の「やめる」を押す。 */
const cancelAfterOtherTabCanceled = async (page: Page) => {
  const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
  await step(page, '「移行をやめる」を押し、やめる前の確認を開く', async () => {
    await page.getByTestId('calendar-cutover-cancel').click()
    await dialog.waitFor()
  })
  await step(page, '撮影のため、同じ職員が開いた別のタブで、先に移行をやめる', () =>
    cancelInOtherTab(page),
  )
  await step(page, 'この画面の確認で「やめる」を押す', () =>
    dialog.getByTestId('calendar-cutover-cancel-confirm-submit').click(),
  )
  return dialog
}

const INTRO_OPEN = '前提 予定の管理を buddy に移す画面を、移行中の状態で開いている'

test.describe('予定の管理の移行で、ほかの画面で先に操作されたとき', () => {
  test.describe(`${ISHIDA.staff.name}（予定を Google カレンダーで管理している事業所のマネージャー）`, () => {
    test.use({ storageState: ISHIDA_STATE })

    // 改修前は文を出さずにダイアログが閉じる。確認する関数は、文が出るか、移行の前の状態に替わるかのどちらかを見る
    test(
      'cutover-conflict-cancel ほかの画面でやめた後に、やめる前の確認でやめるを押した場合、やめるの失敗の文を出すこと',
      { tag: '@compare' },
      async ({ browser, context }) => {
        await prepare(browser, true)

        const page = await context.newPage()
        await openCutover(page, true)
        await intro(
          page,
          `ほかの画面でやめた後に、やめる前の確認でやめるを押すと、やめるの失敗の文を出す\n${INTRO_OPEN}`,
        )

        const dialog = await cancelAfterOtherTabCanceled(page)
        await check(page, `ダイアログのボタンの上に「${NOT_OPEN_MESSAGE}」が出る`, () =>
          expect(
            dialog
              .filter({ hasText: NOT_OPEN_MESSAGE })
              .or(page.getByTestId('calendar-cutover-start'))
              .first(),
          ).toBeVisible(),
        )
      },
    )

    // 改修前は、失敗の文が出ないので「戻る」とタブに戻る 2 つの操作が無い。改修前と改修後で流れが違うので、改修後の流れだけを撮る
    test('cutover-conflict-restart ほかの画面でやめた後にやめるを押し、移行を始めるを押した場合、やめる前の確認のダイアログを開かないこと', async ({
      browser,
      context,
    }) => {
      await prepare(browser, true)

      const page = await context.newPage()
      await openCutover(page, true)
      await intro(
        page,
        `ほかの画面でやめた後にやめるを押し、移行を始め直すと、やめる前の確認のダイアログを開かない\n${INTRO_OPEN}`,
      )

      const dialog = await cancelAfterOtherTabCanceled(page)
      await step(page, '失敗の文を読み、確認の「戻る」を押す', async () => {
        await expect(dialog).toContainText(NOT_OPEN_MESSAGE)
        await dialog.getByTestId('calendar-cutover-cancel-confirm-cancel').click()
      })
      await step(
        page,
        'ほかのタブからこのタブに戻る（撮影のため、戻ったときの出来事を送り、画面に読み直させる）',
        () => returnToTab(page),
      )
      await step(page, '移行の前の状態で、「移行を始める」を押す', async () => {
        await page.getByTestId('calendar-cutover-start').waitFor()
        await page.getByTestId('calendar-cutover-start').click()
      })
      await check(page, '移行中になり、やめる前の確認のダイアログは開かない', async () => {
        await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
        await expect(dialog).toHaveCount(0)
      })
    })

    // 改修前は文を出さずに移行中に替わる。確認する関数は、文が出るか、移行中に替わるかのどちらかを見る
    test(
      'cutover-conflict-start ほかの画面で始めた後に、移行を始めるを押した場合、始めるの失敗の文を出すこと',
      { tag: '@compare' },
      async ({ browser, context }) => {
        await prepare(browser, false)

        const page = await context.newPage()
        await openCutover(page, false)
        await intro(
          page,
          'ほかの画面で始めた後に、移行を始めるを押すと、始めるの失敗の文を出す\n前提 予定の管理を buddy に移す画面を、移行の前の状態で開いている',
        )

        await step(page, '撮影のため、同じ職員が開いた別のタブで、先に移行を始める', () =>
          inOtherTab(page, async (other) => {
            await other.getByTestId('calendar-cutover-start').click()
            await other.getByTestId('calendar-cutover-open').waitFor()
          }),
        )
        await step(page, 'この画面で「移行を始める」を押す', () =>
          page.getByTestId('calendar-cutover-start').click(),
        )
        await check(page, `「移行を始める」の上に「${STARTED_MESSAGE}」が出る`, () =>
          expect(
            page
              .getByTestId('calendar-cutover-start-error')
              .filter({ hasText: STARTED_MESSAGE })
              .or(page.getByTestId('calendar-cutover-open'))
              .first(),
          ).toBeVisible(),
        )
      },
    )

    // 完了すると事業所の予定の管理先が buddy に替わり、ほかの撮影の前提に戻せないので、最後に撮る。
    // 改修前は文を出さずに予定の管理先が buddy の状態に替わる。確認する関数は、文が出るか、予定の管理先が buddy の状態に替わるかのどちらかを見る
    test(
      'cutover-conflict-complete ほかの画面で完了した後に、完了するを押した場合、完了の失敗の文を出すこと',
      { tag: '@compare' },
      async ({ browser, context }) => {
        await prepare(browser, true)

        const page = await context.newPage()
        await openCutover(page, true)
        await intro(
          page,
          `ほかの画面で完了した後に、完了するを押すと、完了の失敗の文を出す\n${INTRO_OPEN}`,
        )

        await step(
          page,
          '撮影のため、同じ職員が開いた別のタブで、取り込んでから先に移行を完了する',
          () =>
            inOtherTab(page, async (other) => {
              await other.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
              await other.getByTestId('calendar-import-preview').click()
              await other.getByTestId('calendar-import-result-preview').waitFor()
              await other.getByTestId('calendar-import-submit').click()
              await other.getByTestId('calendar-import-back-to-cutover').click()
              await other.getByTestId('calendar-cutover-open').waitFor()
              // 取り込みの後の同期が終わるまで、完了するを押し直す
              await expect(async () => {
                await other.getByTestId('calendar-cutover-complete').click()
                await expect(other.getByTestId('calendar-cutover-completed')).toBeVisible()
              }).toPass()
            }),
        )
        await step(page, 'この画面で「完了する」を押す', () =>
          page.getByTestId('calendar-cutover-complete').click(),
        )
        await check(page, `「完了する」の上に「${NOT_OPEN_MESSAGE}」が出る`, () =>
          expect(
            pageBody(page)
              .filter({ hasText: NOT_OPEN_MESSAGE })
              .or(page.getByTestId('calendar-cutover-buddy-primary'))
              .first(),
          ).toBeVisible(),
        )
      },
    )
  })
})
