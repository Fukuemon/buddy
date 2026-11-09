import { expect, test, type Page } from '@playwright/test'

import {
  LEADER,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  RECEIPT_TESTDATA,
  SCHEDULE_URL,
  SEED_PATIENT,
} from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { findSchedule } from '../../fixtures/externalCalendar'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import { signInAtBroker } from '../../screens/login'
import { receiptCategoryRowCells } from '../../selectors/receipt'

// 1 つの事実を、文字、印、件数で重ねて示さないこと（#373）を、画面ごとに 1 本ずつ撮る
const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`
const MORI = LEADER.staff

/** 今日の日付を YYYY-MM-DD で返す。予定のカレンダーは、開いた日を今日にする。 */
const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const signIn = (path: string) => async (page: Page) => {
  await page.goto(path)
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 録画の外で、ログインし、今日の日の表示に自分の訪問の予定を 1 件作っておく。メモは入れない。 */
const createVisitWithoutMemo = async (page: Page) => {
  await signIn('/schedule')(page)
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

/** 録画の外で、ログインし、今日に通常の予定を作り、予定の API でキャンセルしておく。キャンセルの操作は画面に無い。 */
const createCancelledSchedule = (title: string) => async (page: Page) => {
  await signIn('/schedule')(page)
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

  const token = await issueManagerToken(page.request)
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
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}予定のみの行がある照合の結果を開いた場合、実績の側のセルが空で、件数が区分の見出しにだけ出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'redundancy-receipt-result',
          title: '予定と実績の CSV で照合し、予定のみの行と区分の件数の出し方を見る',
          actor: ACTOR,
          variant,
        },
        signIn('/receipt'),
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await step('照合の画面で、予定と実績のダミーの CSV を選び、照合する')
          await page.getByTestId('receipt-source-csv').check()
          await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
          await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
          await page.getByTestId('receipt-check-submit').click()
          await expect(page).toHaveURL(/\/receipt\/result$/)

          await expect(page.getByTestId('receipt-category-mismatch')).toHaveText(
            '不整合データ（3 件）',
          )
          await check(
            '結果の表の上に件数のタイルが無く、件数は区分の見出し「不整合データ（3 件）」に出る',
          )

          const label = page.getByTestId('receipt-category-schedule_only')
          await label.scrollIntoViewIfNeeded()
          await expect(label).toHaveText('予定のみ（1 件）')
          const cells = receiptCategoryRowCells(page, 'schedule_only', '', '')
          // 実績の側の 5 セル（サービス内容_実績から加算まで）は、読み上げの「データなし」だけを持つ
          for (const index of [8, 9, 10, 11, 12]) {
            await expect(cells.nth(index)).toHaveText('データなし')
          }
          await check(
            '「予定のみ（1 件）」の行で、実績の側のセルが空に見え、「データなし」の文字が並ばない',
          )
        },
      )
    })

    test(`${prefix}取り込まない予定を含む期間をプレビューした場合、取り込まない予定が表で 1 回だけ出て、0 件の箱が出ないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'redundancy-import-preview',
          title: `${MORI.name} のカレンダーの 2026 年 11 月をプレビューし、取り込まない予定と件数の箱の出し方を見る`,
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await signIn('/schedule/link')(page)
          await linkStaffCalendar(page, MORI.id)
        },
        async ({ page, step, check }) => {
          try {
            await page.goto(`/schedule/import?staff=${MORI.id}`)
            await expect(page.getByTestId('calendar-import-staff')).toHaveValue(MORI.id)
            await step('期間を 2026-11-01 から 2026-11-30 にして、「プレビューする」を押す')
            await page.getByTestId('calendar-import-start').fill('2026-11-01')
            await page.getByTestId('calendar-import-end').fill('2026-11-30')
            await page.getByTestId('calendar-import-preview').click()

            await expect(page.getByTestId('calendar-import-count-import')).toContainText('6 件')
            await expect(page.getByTestId('calendar-import-count-already_imported')).toBeHidden()
            await check(
              '件数の箱は、取り込む、繰り返し、確認が必要の 3 つで、取り込まないの箱と 0 件の取り込み済みの箱が無い',
            )

            await expect(page.getByTestId('calendar-import-count-needs_review')).not.toContainText(
              '利用者を選んでから',
            )
            await step('「プレビューの結果」の右の ? を押す')
            await page.getByTestId('schedule-import-help').click()
            await expect(page.getByTestId('schedule-import-help-text')).toContainText(
              '確認が必要な予定は、利用者を選んでから取り込みます。',
            )
            await check(
              '確認が必要と取り込み済みの意味は、箱の補足の文ではなく ? のヘルプにだけ出る',
            )
            await page.getByTestId('schedule-import-help').click()
            await expect(page.getByTestId('schedule-import-help-text')).toBeHidden()

            const heading = page.getByTestId('calendar-import-skipped-heading')
            await heading.scrollIntoViewIfNeeded()
            await expect(heading).toHaveText('取り込まない予定（3 件）')
            await expect(page.getByTestId('calendar-import-skipped')).toContainText('終日の予定')
            await check(
              '取り込まない予定は「取り込まない予定（3 件）」の表にだけ出て、理由ごとの件数の箇条書きが無い',
            )
          } finally {
            await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
            await unlinkStaffCalendar(page, MORI.id)
          }
        },
      )
    })

    test(`${prefix}予定の作成を開いた場合、入れていない項目に「未選択」「なし」の文字が出ないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'redundancy-schedule-new',
          title: '予定の作成を開き、入れていない項目の要約を見る',
          actor: ACTOR,
          variant,
        },
        signIn('/schedule'),
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          await step('予定のカレンダーで「予定を作成」を押す')
          await page.getByTestId('schedule-create-open').click()
          await expect(page.getByTestId('schedule-form-modal')).toBeVisible()

          await step('種類の「訪問」を選ぶ')
          await page.getByTestId('schedule-kind-tab-visit').check()
          await expect(page.getByTestId('schedule-field-patient')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-form')).not.toContainText('未選択')
          await expect(page.getByTestId('schedule-field-description')).not.toContainText('なし')
          await check(
            '訪問では、利用者と主訪問者が薄い色の「選んでください」で、メモは空になり、「未選択」「なし」が出ない',
          )

          await step('種類の「通常」を選ぶ')
          await page.getByTestId('schedule-kind-tab-normal').check()
          await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-field-title')).not.toContainText(
            'タイトル タイトル',
          )
          await expect(page.getByTestId('schedule-form')).not.toContainText('未選択')
          await check(
            '通常では、予定者が薄い色の「選んでください」で、タイトルとメモは空になり、「未選択」「なし」が出ない',
          )
        },
      )
    })

    test(`${prefix}メモの無い予定の詳細を開いた場合、メモの見出しが出ないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'redundancy-schedule-detail',
          title: 'メモを入れずに作った訪問の予定の詳細を開き、メモの段を見る',
          actor: ACTOR,
          variant,
        },
        createVisitWithoutMemo,
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          const visit = page
            .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
            .getByTestId(/^schedule-event-/)
            .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
            .first()
          await expect(visit).toBeVisible()
          await step(`日の表示で、メモを入れずに作った ${SEED_PATIENT.name} の訪問の予定を押す`)
          await visit.click()
          await expect(page.getByTestId('schedule-detail-visit')).toContainText(SEED_PATIENT.name)
          await expect(page.getByTestId('schedule-detail-memo')).toHaveCount(0)
          await expect(page.getByTestId('schedule-detail-modal')).not.toContainText('なし')
          await check('予定の詳細に、メモの見出しも「なし」の文字も出ない')
        },
      )
    })

    test(`${prefix}月の表示でキャンセルした予定を見た場合、取り消し線と薄い面で示され、「キャンセル」の文字が出ないこと`, async ({
      browser,
    }) => {
      const title = `訪問看護の担当者会議 ${Date.now()}`
      await recordPrEvidence(
        browser,
        {
          name: 'redundancy-calendar-cancelled',
          title: '月の表示でキャンセルした予定を出し、予定の名前の出方を見る',
          actor: ACTOR,
          variant,
        },
        createCancelledSchedule(title),
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=month')
          await step('月の表示で、左の「キャンセルした予定を出す」を入れる')
          await page.getByTestId('calendar-show-cancelled').check()
          const cancelled = page.getByTestId(/^schedule-event-.+-cancelled$/).filter({
            hasText: title,
          })
          await expect(cancelled).toBeVisible()
          await expect(cancelled).toHaveCSS('text-decoration-line', 'line-through')
          // 「キャンセル」は、読み上げの文にだけ置く
          await expect(cancelled).not.toContainText('キャンセル')
          await check(
            `今日のマスに、取り消し線と薄い面で「${title.split(' ')[0]}」が出て、名前の前に「キャンセル」の文字が無い`,
          )
        },
      )
    })
  }
})
