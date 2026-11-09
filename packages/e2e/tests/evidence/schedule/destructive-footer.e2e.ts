import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const VISIT_URL = storyUrl('画面-schedule-scheduledetailmodalcontainer--visit')
const GOOGLE_URL = storyUrl('画面-schedule-scheduledetailmodalcontainer--google-calendar')

const openDetail = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

const CANCEL = 'schedule-detail-cancel-schedule'
const CLOSE = 'schedule-detail-close'
const EDIT = 'schedule-detail-edit'

/** 予定の詳細のフッターの 3 つのボタンの testid を、画面の左にあるものから順に返す。 */
const footerOrder = async (page: Page) => {
  const boxes = [
    { id: CANCEL, box: await page.getByTestId('schedule-detail-cancel-schedule').boundingBox() },
    { id: CLOSE, box: await page.getByTestId('schedule-detail-close').boundingBox() },
    { id: EDIT, box: await page.getByTestId('schedule-detail-edit').boundingBox() },
  ]
  return boxes.sort((a, b) => (a.box?.x ?? -1) - (b.box?.x ?? -1)).map(({ id }) => id)
}

test.describe('予定の詳細', () => {
  test.describe('データを失う操作のボタン', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}キャンセルできる予定の詳細を開いた場合、予定をキャンセルするボタンが赤い文字でフッターの左端にあり、閉じると編集が右にあること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-cancel-button',
            title:
              'キャンセルできる予定の詳細のフッターで、予定をキャンセルするボタンの見た目と位置を見る',
            actor: ACTOR,
            variant,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await step(
              'キャンセルできる訪問の予定の詳細（Storybook の ScheduleDetailModalContainer の Visit）を開いている',
            )
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toHaveText(
              '予定をキャンセル',
            )
            await expect(page.getByTestId('schedule-detail-close')).toHaveText('閉じる')
            await expect(page.getByTestId('schedule-detail-edit')).toHaveText('編集')
            if (isBefore) {
              await expect.poll(() => footerOrder(page)).toEqual([CLOSE, CANCEL, EDIT])
              await check(
                '改修前: 「閉じる」「予定をキャンセル」「編集」が、同じ青い文字の副のボタンで右に並ぶ',
              )
            } else {
              await expect.poll(() => footerOrder(page)).toEqual([CANCEL, CLOSE, EDIT])
              await check(
                '「予定をキャンセル」が赤い文字でフッターの左端にあり、「閉じる」と「編集」が右にまとまる',
              )
            }
          },
        )
      })

      test(`${prefix}予定をキャンセルするボタンを押した場合、確認のダイアログに閉じる側のボタンと確定のボタンが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-cancel-dialog-labels',
            title:
              '予定のキャンセルの確認のダイアログの、閉じる側のボタンと確定のボタンの文言を見る',
            actor: ACTOR,
            variant,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await step('キャンセルできる訪問の予定の詳細を開いている')
            await step('「予定をキャンセル」を押す')
            await page.getByTestId('schedule-detail-cancel-schedule').click()
            const dialog = page.getByTestId('schedule-cancel-dialog')
            await expect(dialog.getByTestId('schedule-cancel-submit')).toHaveText(
              '予定をキャンセルする',
            )
            if (isBefore) {
              await expect(dialog.getByTestId('schedule-cancel-cancel')).toHaveText('キャンセル')
              await check(
                '改修前: 閉じる側の「キャンセル」と、確定の「予定をキャンセルする」が並び、どちらも「キャンセル」の語を持つ',
              )
            } else {
              await expect(dialog.getByTestId('schedule-cancel-cancel')).toHaveText('戻る')
              await check(
                '閉じる側の「戻る」と、確定の「予定をキャンセルする」（理由を入れるまで押せない）が並び、「キャンセル」の語だけのボタンが無い',
              )
            }
          },
        )
      })

      test(`${prefix}確認のダイアログで閉じる側のボタンを押した場合、予定をキャンセルせずに予定の詳細に戻ること`, async ({
        browser,
      }) => {
        const backLabel = isBefore ? 'キャンセル' : '戻る'
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-cancel-dialog-back',
            title: '予定のキャンセルの確認のダイアログを、閉じる側のボタンで閉じる',
            actor: ACTOR,
            variant,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await page.getByTestId('schedule-detail-cancel-schedule').click()
            await expect(page.getByTestId('schedule-cancel-dialog')).toBeVisible()
            await step('予定の詳細から、予定のキャンセルの確認のダイアログを開いている')
            await step(`「${backLabel}」を押す`)
            await page.getByTestId('schedule-cancel-cancel').click()
            await expect(page.getByTestId('schedule-cancel-dialog')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-cancel')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
            await check(
              '確認のダイアログが閉じ、予定の詳細に戻る。キャンセルした予定の印は出ず、「予定をキャンセル」が残る',
            )
          },
        )
      })

      test(`${prefix}Google カレンダーから取り込んだ予定の詳細を開いた場合、Google カレンダーの予定であることの出し方を見ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-google-calendar-mark',
            title:
              'Google カレンダーから取り込んだ予定の詳細で、Google カレンダーの予定であることの出し方を見る',
            actor: ACTOR,
            variant,
          },
          openDetail(GOOGLE_URL),
          async ({ page, step, check }) => {
            await openDetail(GOOGLE_URL)(page)
            await step(
              'Google カレンダーの予定の詳細（Storybook の ScheduleDetailModalContainer の GoogleCalendar）を開いている',
            )
            const mark = page.getByTestId('schedule-detail-google-calendar')
            if (isBefore) {
              await expect(mark).toContainText('buddy で変更かキャンセルすると')
              await check(
                '改修前: 本文の先頭に、Google カレンダーの予定であることと、buddy で変えると Google カレンダーにも書くことの枠が常に出る',
              )
            } else {
              await expect(mark).toHaveText('Google カレンダー')
              await expect(page.getByTestId('schedule-detail-google-calendar-help')).toBeVisible()
              await expect(
                page.getByTestId('schedule-detail-google-calendar-help-text'),
              ).toBeHidden()
              await check(
                'タイトルの下に「Google カレンダー」の印と ? が出て、書き込みの説明の文は ? を押すまで出ない',
              )
            }
          },
        )
      })

      test(`${prefix}Google カレンダーの予定の詳細で ? を押した場合、buddy で変えると Google カレンダーにも書くことが出ること`, async ({
        browser,
      }) => {
        test.skip(isBefore, '改修前の画面には ? が無い')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-google-calendar-help',
            title: 'Google カレンダーの予定の詳細で ? を押し、書き込みの説明を開く',
            actor: ACTOR,
            variant,
          },
          openDetail(GOOGLE_URL),
          async ({ page, step, check }) => {
            await openDetail(GOOGLE_URL)(page)
            await step('Google カレンダーの予定の詳細を開いている')
            await step('「Google カレンダー」の印の右の ? を押す')
            await page.getByTestId('schedule-detail-google-calendar-help').click()
            await expect(page.getByTestId('schedule-detail-google-calendar-help-text')).toHaveText(
              'buddy で変更かキャンセルすると、Google カレンダーにも書きます。',
            )
            await check('「buddy で変更かキャンセルすると、Google カレンダーにも書きます。」が出る')
          },
        )
      })
    }
  })
})
