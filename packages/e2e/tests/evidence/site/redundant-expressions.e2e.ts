import { expect, test, type Browser, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import {
  LEADER,
  LOGIN_STAFF,
  LOGIN_STATE,
  RECEIPT_TESTDATA,
  SCHEDULE_URL,
  SEED_PATIENT,
} from '../../fixtures/env'
import { findSchedule } from '../../fixtures/externalCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import { receiptCategoryRowCells } from '../../selectors/receipt'

// 1 つの事実を、文字、印、件数で重ねて示さないこと（#373）を、画面ごとに 1 本ずつ撮る
const MORI = LEADER.staff

/** 今日の日付を YYYY-MM-DD で返す。予定のカレンダーは、開いた日を今日にする。 */
const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 録画の外で、マネージャーのコンテキストで prepare を行う。 */
const prepareAsManager = (browser: Browser, prepare: (page: Page) => Promise<void>) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, prepare)

/** 録画の外で、今日の日の表示に自分の訪問の予定を 1 件作っておく。メモは入れない。 */
const createVisitWithoutMemo = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
  await page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`).check()
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

/** 録画の外で、今日に通常の予定を作り、予定の API でキャンセルしておく。キャンセルの操作は画面に無い。 */
const createCancelledSchedule = (title: string) => async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()

  const token = await issueManagerToken()
  const schedule = await findSchedule(page.request, token, STAFF_FORM.facilityId, {
    date: today(),
    title,
  })
  if (schedule === undefined) throw new Error(`作った予定が見つからない: ${title}`)
  const res = await page.request.post(`${SCHEDULE_URL}/v1/schedules/${schedule.id}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { reason: '利用者の都合' },
  })
  expect(res.status()).toBe(201)
}

test.describe('重ねない表現', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('redundancy-receipt-result 予定のみの行がある照合の結果を開いた場合、実績の側のセルが空で、件数が区分の見出しにだけ出ること', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      await intro(page, '予定と実績の CSV で照合し、予定のみの行と区分の件数の出し方を見る')

      await step(page, '照合の画面で、予定と実績のダミーの CSV を選び、照合する', async () => {
        await page.getByTestId('receipt-source-csv').check()
        await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
        await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
        await page.getByTestId('receipt-check-submit').click()
      })
      await check(
        page,
        '結果の表の上に件数のタイルが無く、件数は区分の見出し「不整合データ（3 件）」に出る',
        async () => {
          await expect(page).toHaveURL(/\/receipt\/result$/)
          await expect(page.getByTestId('receipt-category-mismatch')).toHaveText(
            '不整合データ（3 件）',
          )
        },
      )

      const label = page.getByTestId('receipt-category-schedule_only')
      await step(page, '（撮影のため、「予定のみ」の区分が見える位置まで送る）', () =>
        label.scrollIntoViewIfNeeded(),
      )
      await check(
        page,
        '「予定のみ（1 件）」の行で、実績の側のセルが空に見え、「データなし」の文字が並ばない',
        async () => {
          await expect(label).toHaveText('予定のみ（1 件）')
          const cells = receiptCategoryRowCells(page, 'schedule_only', '', '')
          // 実績の側の 5 セル（サービス内容_実績から加算まで）は、読み上げの「データなし」だけを持つ
          for (const index of [8, 9, 10, 11, 12]) {
            await expect(cells.nth(index)).toHaveText('データなし')
          }
        },
      )
    })

    test('redundancy-import-preview 取り込まない予定を含む期間をプレビューした場合、取り込まない予定が表で 1 回だけ出て、0 件の箱が出ないこと', async ({
      browser,
      context,
    }) => {
      await prepareAsManager(browser, (page) => linkStaffCalendar(page, MORI.id))

      const page = await context.newPage()
      try {
        await page.goto(`/schedule/import?staff=${MORI.id}`)
        await expect(page.getByTestId('calendar-import-staff')).toHaveValue(MORI.id)
        await intro(
          page,
          `${MORI.name} のカレンダーの 2026 年 11 月をプレビューし、取り込まない予定と件数の箱の出し方を見る\n前提 撮影の前に、${MORI.name} にカレンダーを結び付けた`,
        )

        await step(
          page,
          '期間を 2026-11-01 から 2026-11-30 にして、「プレビューする」を押す',
          async () => {
            await page.getByTestId('calendar-import-start').fill('2026-11-01')
            await page.getByTestId('calendar-import-end').fill('2026-11-30')
            await page.getByTestId('calendar-import-preview').click()
          },
        )
        await check(
          page,
          '件数の箱は、取り込む、繰り返し、確認が必要の 3 つで、取り込まないの箱と 0 件の取り込み済みの箱が無い',
          async () => {
            await expect(page.getByTestId('calendar-import-count-import')).toContainText('6 件')
            await expect(page.getByTestId('calendar-import-count-already_imported')).toBeHidden()
          },
        )

        await step(page, '「プレビューの結果」の右の ? を押す', () =>
          page.getByTestId('schedule-import-help').click(),
        )
        await check(
          page,
          '確認が必要と取り込み済みの意味は、箱の補足の文ではなく ? のヘルプにだけ出る',
          async () => {
            await expect(page.getByTestId('calendar-import-count-needs_review')).not.toContainText(
              '利用者を選んでから',
            )
            await expect(page.getByTestId('schedule-import-help-text')).toContainText(
              '確認が必要な予定は、利用者を選んでから取り込みます。',
            )
          },
        )

        const heading = page.getByTestId('calendar-import-skipped-heading')
        await step(page, '（撮影のため、ヘルプを閉じ、取り込まない予定の表まで送る）', async () => {
          await page.getByTestId('schedule-import-help').click()
          await expect(page.getByTestId('schedule-import-help-text')).toBeHidden()
          await heading.scrollIntoViewIfNeeded()
        })
        await check(
          page,
          '取り込まない予定は「取り込まない予定（3 件）」の表にだけ出て、理由ごとの件数の箇条書きが無い',
          async () => {
            await expect(heading).toHaveText('取り込まない予定（3 件）')
            await expect(page.getByTestId('calendar-import-skipped')).toContainText('終日の予定')
          },
        )
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, MORI.id),
        )
      }
    })

    test('redundancy-schedule-new 予定の作成を開いた場合、入れていない項目に「未選択」「なし」の文字が出ないこと', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await intro(page, '予定の作成を開き、入れていない項目の要約を見る')

      await step(page, '予定のカレンダーで「予定を作成」を押す', async () => {
        await page.getByTestId('schedule-create-open').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
      })
      await step(page, '種類の「訪問」を選ぶ', () =>
        page.getByTestId('schedule-kind-tab-visit').check(),
      )
      await check(
        page,
        '訪問では、利用者と主訪問者が薄い色の「選んでください」で、メモは空になり、「未選択」「なし」が出ない',
        async () => {
          await expect(page.getByTestId('schedule-field-patient')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-form')).not.toContainText('未選択')
          await expect(page.getByTestId('schedule-field-description')).not.toContainText('なし')
        },
      )

      await step(page, '種類の「通常」を選ぶ', () =>
        page.getByTestId('schedule-kind-tab-normal').check(),
      )
      await check(
        page,
        '通常では、予定者が薄い色の「選んでください」で、タイトルとメモは空になり、「未選択」「なし」が出ない',
        async () => {
          await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-field-title')).not.toContainText(
            'タイトル タイトル',
          )
          await expect(page.getByTestId('schedule-form')).not.toContainText('未選択')
        },
      )
    })

    test('redundancy-schedule-detail メモの無い予定の詳細を開いた場合、メモの見出しが出ないこと', async ({
      browser,
      context,
    }) => {
      await prepareAsManager(browser, createVisitWithoutMemo)

      const page = await context.newPage()
      await page.goto('/schedule?view=day')
      const visit = page
        .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
        .first()
      await expect(visit).toBeVisible()
      await intro(
        page,
        `メモを入れずに作った訪問の予定の詳細を開き、メモの段を見る\n前提 撮影の前に、今日に ${SEED_PATIENT.name} の訪問の予定をメモを入れずに作った`,
      )

      await step(
        page,
        `日の表示で、メモを入れずに作った ${SEED_PATIENT.name} の訪問の予定を押す`,
        () => visit.click(),
      )
      await check(page, '予定の詳細に、メモの見出しも「なし」の文字も出ない', async () => {
        await expect(page.getByTestId('schedule-detail-visit')).toContainText(SEED_PATIENT.name)
        await expect(page.getByTestId('schedule-detail-memo')).toHaveCount(0)
        await expect(page.getByTestId('schedule-detail-modal')).not.toContainText('なし')
      })
    })

    test('redundancy-calendar-cancelled 月の表示でキャンセルした予定を見た場合、取り消し線と薄い面で示され、「キャンセル」の文字が出ないこと', async ({
      browser,
      context,
    }) => {
      const title = `訪問看護の担当者会議 ${Date.now()}`
      await prepareAsManager(browser, createCancelledSchedule(title))

      const page = await context.newPage()
      await page.goto('/schedule?view=month')
      await expect(page.getByTestId('calendar-show-cancelled')).toBeVisible()
      await intro(
        page,
        `月の表示でキャンセルした予定を出し、予定の名前の出方を見る\n前提 撮影の前に、今日に「${title}」を作り、キャンセルした`,
      )

      await step(page, '月の表示で、左の「キャンセルした予定を出す」を入れる', () =>
        page.getByTestId('calendar-show-cancelled').check(),
      )
      await check(
        page,
        `今日のマスに、取り消し線と薄い面で「${title.split(' ')[0]}」が出て、名前の前に「キャンセル」の文字が無い`,
        async () => {
          const cancelled = page
            .getByTestId(/^schedule-event-.+-cancelled$/)
            .filter({ hasText: title })
          await expect(cancelled).toBeVisible()
          await expect(cancelled).toHaveCSS('text-decoration-line', 'line-through')
          // 「キャンセル」は、読み上げの文にだけ置く
          await expect(cancelled).not.toContainText('キャンセル')
        },
      )
    })
  })
})
