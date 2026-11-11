import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const VISIT_URL = storyUrl('画面-schedule-scheduledetailmodalcontainer--visit')
const GOOGLE_URL = storyUrl('画面-schedule-scheduledetailmodalcontainer--google-calendar')

const openDetail = async (page: Page, url: string) => {
  await page.goto(url)
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

const CANCEL = 'schedule-detail-cancel-schedule'
const CLOSE = 'schedule-detail-close'
const EDIT = 'schedule-detail-edit'

/** 予定の詳細のフッターの 3 つのボタンの testid を、画面の左にあるものから順に、`,` でつないで返す。 */
const footerOrder = async (page: Page) => {
  const boxes = [
    { id: CANCEL, box: await page.getByTestId('schedule-detail-cancel-schedule').boundingBox() },
    { id: CLOSE, box: await page.getByTestId('schedule-detail-close').boundingBox() },
    { id: EDIT, box: await page.getByTestId('schedule-detail-edit').boundingBox() },
  ]
  return boxes
    .sort((a, b) => (a.box?.x ?? -1) - (b.box?.x ?? -1))
    .map(({ id }) => id)
    .join(',')
}

// @compare のテストのボタンの色と並びは、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版で通る文言と並びだけを見る
test.describe('予定の詳細', () => {
  test.describe('データを失う操作のボタン（ログインなし、Storybook の story）', () => {
    test(
      'schedule-detail-cancel-button キャンセルできる予定の詳細を開いた場合、予定をキャンセルするボタンが赤い文字でフッターの左端にあり、閉じると編集が右にあること',
      { tag: '@compare' },
      async ({ page }) => {
        await openDetail(page, VISIT_URL)
        await intro(
          page,
          'キャンセルできる予定の詳細のフッターで、予定をキャンセルするボタンの見た目と位置を見る\n前提 キャンセルできる訪問の予定の詳細（Storybook の ScheduleDetailModalContainer の Visit）を開いている',
        )

        await check(
          page,
          '「予定をキャンセル」が赤い文字でフッターの左端にあり、「閉じる」と「編集」が右にまとまる',
          async () => {
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toHaveText(
              '予定をキャンセル',
            )
            await expect(page.getByTestId('schedule-detail-close')).toHaveText('閉じる')
            await expect(page.getByTestId('schedule-detail-edit')).toHaveText('編集')
            // 改修前は「閉じる」「予定をキャンセル」「編集」、改修後は「予定をキャンセル」「閉じる」「編集」の順に並ぶ
            await expect
              .poll(() => footerOrder(page))
              .toMatch(new RegExp(`^(${CLOSE},${CANCEL}|${CANCEL},${CLOSE}),${EDIT}$`))
          },
        )
      },
    )

    test(
      'schedule-cancel-dialog-labels 予定をキャンセルするボタンを押した場合、確認のダイアログに閉じる側のボタンと確定のボタンが出ること',
      { tag: '@compare' },
      async ({ page }) => {
        await openDetail(page, VISIT_URL)
        await intro(
          page,
          '予定のキャンセルの確認のダイアログの、閉じる側のボタンと確定のボタンの文言を見る\n前提 キャンセルできる訪問の予定の詳細を開いている',
        )

        await step(page, '「予定をキャンセル」を押す', () =>
          page.getByTestId('schedule-detail-cancel-schedule').click(),
        )
        const dialog = page.getByTestId('schedule-cancel-dialog')
        await check(
          page,
          '閉じる側の「戻る」と、確定の「予定をキャンセルする」（理由を入れるまで押せない）が並び、「キャンセル」の語だけのボタンが無い',
          async () => {
            await expect(dialog.getByTestId('schedule-cancel-submit')).toHaveText(
              '予定をキャンセルする',
            )
            // 改修前の閉じる側は「キャンセル」である
            await expect(dialog.getByTestId('schedule-cancel-cancel')).toHaveText(
              /^(戻る|キャンセル)$/,
            )
          },
        )
      },
    )

    test(
      'schedule-cancel-dialog-back 確認のダイアログで閉じる側のボタンを押した場合、予定をキャンセルせずに予定の詳細に戻ること',
      { tag: '@compare' },
      async ({ page }) => {
        await openDetail(page, VISIT_URL)
        await page.getByTestId('schedule-detail-cancel-schedule').click()
        await expect(page.getByTestId('schedule-cancel-dialog')).toBeVisible()
        await intro(
          page,
          '予定のキャンセルの確認のダイアログを、閉じる側のボタンで閉じる\n前提 予定の詳細から、予定のキャンセルの確認のダイアログを開いている',
        )

        await step(page, '「戻る」を押す', () => page.getByTestId('schedule-cancel-cancel').click())
        await check(
          page,
          '確認のダイアログが閉じ、予定の詳細に戻る。キャンセルした予定の印は出ず、「予定をキャンセル」が残る',
          async () => {
            await expect(page.getByTestId('schedule-cancel-dialog')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-cancel')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
          },
        )
      },
    )

    test(
      'schedule-detail-google-calendar-mark Google カレンダーから取り込んだ予定の詳細を開いた場合、Google カレンダーの予定であることの出し方を見ること',
      { tag: '@compare' },
      async ({ page }) => {
        await openDetail(page, GOOGLE_URL)
        await intro(
          page,
          'Google カレンダーから取り込んだ予定の詳細で、Google カレンダーの予定であることの出し方を見る\n前提 Google カレンダーの予定の詳細（Storybook の ScheduleDetailModalContainer の GoogleCalendar）を開いている',
        )

        await check(
          page,
          'タイトルの下に「Google カレンダー」の印と ? が出て、書き込みの説明の文は ? を押すまで出ない',
          // 改修前は、本文の先頭に Google カレンダーの予定であることと書き込みの説明の枠が常に出る
          () =>
            expect(page.getByTestId('schedule-detail-google-calendar')).toContainText(
              'Google カレンダー',
            ),
        )
      },
    )

    // 改修前の画面には ? が無いので、改修前と比べない
    test('schedule-detail-google-calendar-help Google カレンダーの予定の詳細で ? を押した場合、buddy で変えると Google カレンダーにも書くことが出ること', async ({
      page,
    }) => {
      await openDetail(page, GOOGLE_URL)
      await intro(
        page,
        'Google カレンダーの予定の詳細で ? を押し、書き込みの説明を開く\n前提 Google カレンダーの予定の詳細を開いている',
      )

      await step(page, '「Google カレンダー」の印の右の ? を押す', () =>
        page.getByTestId('schedule-detail-google-calendar-help').click(),
      )
      await check(
        page,
        '「buddy で変更かキャンセルすると、Google カレンダーにも書きます。」が出る',
        () =>
          expect(page.getByTestId('schedule-detail-google-calendar-help-text')).toHaveText(
            'buddy で変更かキャンセルすると、Google カレンダーにも書きます。',
          ),
      )
    })
  })
})
