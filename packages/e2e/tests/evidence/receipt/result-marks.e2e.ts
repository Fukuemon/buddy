import { writeFile } from 'node:fs/promises'

import { expect, test, type Locator } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { receiptCategoryRowCells } from '../../selectors/receipt'

/**
 * 観点ごとの行を持つ、ダミーの予定の CSV。訪看I２ と訪看I３ の予定は、照合で終了時間と提供時間から 1 分を引く。
 * 利用者A は開始時間だけ、利用者B は実績の提供時間が範囲の外、利用者C は加算、利用者D は範囲の中の値の違いが予定と食い違う。
 * 利用者E は予定だけ、利用者F は実績だけがある。
 */
const SCHEDULES = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者',
  '2024/04/01,利用者A,09:00,09:30,30,訪看I2,職員B',
  '2024/04/01,利用者B,10:00,10:30,30,訪看I2,職員B',
  '2024/04/01,利用者C,11:00,11:30,30,訪看I2,職員B',
  '2024/04/01,利用者D,13:00,13:45,45,訪看I3,職員B',
  '2024/04/01,利用者E,14:00,14:30,30,訪看I2,職員B',
  '',
].join('\n')

/** SCHEDULES と対になる、ダミーの実績の CSV。 */
const VISITS = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤',
  '2024/04/01,利用者A,9:15,9:44,29,訪看I2,職員B,通常,,,,',
  '2024/04/01,利用者B,10:00,10:35,35,訪看I2,職員B,通常,,,,',
  '2024/04/01,利用者C,11:00,11:29,29,訪看I2,職員B,緊急,,,,',
  '2024/04/01,利用者D,13:00,13:50,50,訪看I3,職員B,通常,,,,',
  '2024/04/01,利用者F,15:00,15:29,29,訪看I2,職員B,通常,,,,',
  '',
].join('\n')

/** 結果の表の列の位置。列の順は画面仕様書の結果の表にある。 */
const COLUMN = {
  findings: 3,
  scheduleStart: 5,
  scheduleEnd: 6,
  scheduleDuration: 7,
  visitStart: 9,
  visitEnd: 10,
  visitDuration: 11,
  additions: 12,
} as const

type Column = Exclude<keyof typeof COLUMN, 'findings'>

/**
 * 結果の表を送って見せる、行の観点のセル。
 * 改修前の表は「確認すること」の列を持たず列が 1 つ少ないので、最後の列の加算は、番号ではなく最後のセルで指す。
 */
const focusCell = (cells: Locator, column: Column) =>
  column === 'additions' ? cells.last() : cells.nth(COLUMN[column])

/**
 * 行に、values のそれぞれで始まるセルがあることを確認する。
 * 改修前と改修後で、印の書き方と列の位置が違っても、値そのものは同じなので、両方で通る。
 */
const expectCellsStartWith = async (cells: Locator, ...values: string[]) => {
  for (const value of values) {
    await expect(cells.filter({ hasText: new RegExp(`^${value}`) })).not.toHaveCount(0)
  }
}

const ITEMS: {
  name: string
  test: string
  title: string
  category: 'mismatch' | 'schedule_only' | 'visit_only' | 'match'
  patient: string
  /** 結果の表を送り、観点のセルを見せる位置。 */
  focus: Column
  /** 確認することの列の後で見せる位置。省くと focus にする。 */
  afterFocus?: Column
  /** 改修前と改修後の両方で、観点の行に出る値。 */
  values: string[]
  /** 確認することの列を見せた判定の文。 */
  findingsResult: string
  /** 観点のセルを見せた判定の文。 */
  afterResult: string
}[] = [
  {
    name: 'receipt-marks-start',
    test: '予定と実績の開始時間が違う行を照合した場合、両側の開始時間に不一致の印が付き、確認することに理由が出ること',
    title: '開始時間だけが予定と違う行の、開始時間の印と確認することの文を見る',
    category: 'mismatch',
    patient: '利用者A',
    focus: 'scheduleStart',
    afterFocus: 'visitStart',
    values: ['09:00', '09:15'],
    findingsResult:
      '利用者A の確認することの列に「開始時間が予定と違う」が出て、予定の開始時間 09:00 に不一致のアイコンが付く',
    afterResult: '実績の開始時間 09:15 に不一致のアイコンが付く',
  },
  {
    name: 'receipt-marks-duration-out-of-range',
    test: '実績の提供時間が予定と違い範囲の外の行を照合した場合、提供時間のセルに不一致の印が 1 つだけ付き、理由が 2 つ出ること',
    title: '実績の提供時間 35 分が予定の 29 分と違い、範囲（20〜29 分）の外の行を見る',
    category: 'mismatch',
    patient: '利用者B',
    focus: 'visitDuration',
    values: ['35'],
    findingsResult:
      '利用者B の確認することの列に、提供時間が範囲の外であることと、予定と違うことの 2 つの文が出る',
    afterResult: '実績の提供時間に不一致のアイコンが 1 つだけ付き、下に「範囲 20〜29 分」が出る',
  },
  {
    name: 'receipt-marks-additions',
    test: '加算に緊急時の訪問の加算を含む行を照合した場合、加算のセルに不一致の印が付くこと',
    title: '加算が「緊急」の行の、加算の印と確認することの文を見る',
    category: 'mismatch',
    patient: '利用者C',
    focus: 'additions',
    values: ['緊急'],
    findingsResult: '利用者C の確認することの列に「加算が規則に合わない」が出る',
    afterResult: '加算の「緊急」に不一致のアイコンが付く',
  },
  {
    name: 'receipt-marks-note',
    test: '提供時間と終了時間が予定と違いどちらも範囲の中の行を照合した場合、整合の行の両側に注意の印が付くこと',
    title: '整合の行で、提供時間と終了時間が予定と違う（どちらも範囲 30〜59 分の中）行を見る',
    category: 'match',
    patient: '利用者D',
    focus: 'scheduleEnd',
    afterFocus: 'visitDuration',
    values: ['13:44', '13:50'],
    findingsResult:
      '利用者D の確認することの列に「提供時間が予定と違う」と「終了時間が予定と違う」が出て、予定の終了時間 13:44 に注意のアイコンが付く',
    afterResult:
      '実績の終了時間 13:50 と提供時間 50 に注意のアイコンが付き、提供時間の下に「範囲 30〜59 分」が出る',
  },
  {
    name: 'receipt-marks-one-side',
    test: '予定のみと実績のみの行がある場合、確認することに実績が無いと予定が無いが出ること',
    title: '予定のみの利用者E と、実績のみの利用者F の行を見る',
    category: 'schedule_only',
    patient: '利用者E',
    focus: 'scheduleStart',
    values: ['14:00'],
    findingsResult:
      '予定のみの利用者E の確認することに「実績が無い」が、実績のみの利用者F に「予定が無い」が出る',
    afterResult: '実績のみの利用者F の、予定の側のセルは空のままである',
  },
]

test.describe('照合の結果', () => {
  test.describe(`食い違いの印（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    for (const item of ITEMS) {
      test(`${item.name} ${item.test}`, { tag: '@compare' }, async ({ page }, testInfo) => {
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, SCHEDULES)
        await writeFile(visits, VISITS)

        await page.goto('/receipt')
        await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
        await intro(
          page,
          `${item.title}\n前提 予定と実績のダミーの CSV は、利用者A から F の行を持つ`,
        )

        await step(page, '予定の CSV と実績の CSV を選び、照合する', async () => {
          await page.getByTestId('receipt-source-csv').check()
          await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
          await page.getByTestId('receipt-visits-file').setInputFiles(visits)
          await page.getByTestId('receipt-check-submit').click()
          await expect(page).toHaveURL(/\/receipt\/result$/)
        })

        const cells = receiptCategoryRowCells(
          page,
          item.category,
          '2024年4月1日（月）',
          item.patient,
        )
        await step(page, `結果の表で、${item.patient} の行の確認することの列を見る`, () =>
          cells.nth(COLUMN.findings).scrollIntoViewIfNeeded(),
        )
        await check(page, item.findingsResult, () => expectCellsStartWith(cells, ...item.values))
        await step(page, `結果の表で、${item.patient} の行の観点のセルが見えるまで送る`, () =>
          focusCell(cells, item.afterFocus ?? item.focus).scrollIntoViewIfNeeded(),
        )
        await check(page, item.afterResult, async () => {
          await expectCellsStartWith(cells, ...item.values)
          if (item.name === 'receipt-marks-one-side') {
            const visitOnly = receiptCategoryRowCells(
              page,
              'visit_only',
              '2024年4月1日（月）',
              '利用者F',
            )
            await expectCellsStartWith(visitOnly, '15:00')
          }
        })
      })
    }
  })
})
