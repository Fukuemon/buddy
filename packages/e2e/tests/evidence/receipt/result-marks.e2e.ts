import { writeFile } from 'node:fs/promises'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { receiptCategoryRowCells, receiptFindingItems } from '../../selectors/receipt'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

const signIn = async (page: Page) => {
  await page.goto('/receipt')
  await signInAtBroker(page, LOGIN_EMAIL)
}

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

/** 改修前の表は「確認すること」の列を持たないので、確認することの後ろの列が 1 つ左にずれる。 */
const BEFORE_COLUMN = {
  scheduleStart: 4,
  scheduleEnd: 5,
  scheduleDuration: 6,
  visitStart: 8,
  visitEnd: 9,
  visitDuration: 10,
  additions: 11,
} as const

type Cells = Locator

const findings = (cells: Cells) => receiptFindingItems(cells.nth(COLUMN.findings))

const ITEMS: {
  name: string
  test: string
  title: string
  category: 'mismatch' | 'schedule_only' | 'visit_only' | 'match'
  patient: string
  /** 結果の表を送り、観点のセルを見せる位置。 */
  focus: keyof typeof BEFORE_COLUMN
  before: (cells: Cells) => Promise<void>
  beforeResult: string
  after: (cells: Cells) => Promise<void>
  afterResult: string
}[] = [
  {
    name: 'receipt-marks-start',
    test: '予定と実績の開始時間が違う行を照合した場合、両側の開始時間に不一致の印が付き、確認することに理由が出ること',
    title: '開始時間だけが予定と違う行の、開始時間の印と確認することの文を見る',
    category: 'mismatch',
    patient: '利用者A',
    focus: 'scheduleStart',
    before: async (cells) => {
      await expect(cells.nth(BEFORE_COLUMN.scheduleStart)).toHaveText('09:00 ❌')
      await expect(cells.nth(BEFORE_COLUMN.visitStart)).toHaveText('09:15 ❌')
    },
    beforeResult: '両側の開始時間に記号の「❌」だけが付き、何が違うかの文は無い',
    after: async (cells) => {
      await expect(findings(cells).first()).toHaveText('開始時間が予定と違う')
      await expect(cells.nth(COLUMN.scheduleStart)).toHaveText('09:00（不一致）')
      await expect(cells.nth(COLUMN.visitStart)).toHaveText('09:15（不一致）')
    },
    afterResult:
      '両側の開始時間に不一致のアイコンが付き、確認することの列に「開始時間が予定と違う」が出る',
  },
  {
    name: 'receipt-marks-duration-out-of-range',
    test: '実績の提供時間が予定と違い範囲の外の行を照合した場合、提供時間のセルに不一致の印が 1 つだけ付き、理由が 2 つ出ること',
    title: '実績の提供時間 35 分が予定の 29 分と違い、範囲（20〜29 分）の外の行を見る',
    category: 'mismatch',
    patient: '利用者B',
    focus: 'visitDuration',
    before: async (cells) => {
      await expect(cells.nth(BEFORE_COLUMN.visitDuration)).toHaveText('35 ❌ ❌ (20~29)')
    },
    beforeResult: '実績の提供時間が「35 ❌ ❌ (20~29)」になり、2 つの「❌」の意味を見分けられない',
    after: async (cells) => {
      const duration = cells.nth(COLUMN.visitDuration)
      await expect(duration).toHaveText('35（不一致）範囲 20〜29 分')
      await expect(duration.getByTestId('receipt-mark-mismatch')).toHaveCount(1)
      await expect(duration.getByTestId('receipt-mark-note')).toHaveCount(0)
      await expect(findings(cells)).toContainText([
        '実績の提供時間 35 分が範囲（20〜29 分）の外',
        '提供時間が予定と違う',
      ])
    },
    afterResult:
      '実績の提供時間に不一致のアイコンが 1 つだけ付き、下に「範囲 20〜29 分」が出て、確認することに範囲の外と予定と違うことの 2 つの文が出る',
  },
  {
    name: 'receipt-marks-additions',
    test: '加算に緊急時の訪問の加算を含む行を照合した場合、加算のセルに不一致の印が付くこと',
    title: '加算が「緊急」の行の、加算の印と確認することの文を見る',
    category: 'mismatch',
    patient: '利用者C',
    focus: 'additions',
    before: async (cells) => {
      await expect(cells.nth(BEFORE_COLUMN.additions)).toHaveText('緊急 ※')
    },
    beforeResult: '行は不整合なのに、加算には注意の「※」が付く',
    after: async (cells) => {
      await expect(findings(cells)).toHaveText(['加算が規則に合わない'])
      await expect(cells.nth(COLUMN.additions)).toHaveText('緊急（不一致）')
      await expect(cells.nth(COLUMN.additions).getByTestId('receipt-mark-mismatch')).toHaveCount(1)
    },
    afterResult:
      '加算のセルに不一致のアイコンが付き、確認することの列に「加算が規則に合わない」が出る',
  },
  {
    name: 'receipt-marks-note',
    test: '提供時間と終了時間が予定と違いどちらも範囲の中の行を照合した場合、整合の行の両側に注意の印が付くこと',
    title: '整合の行で、提供時間と終了時間が予定と違う（どちらも範囲 30〜59 分の中）行を見る',
    category: 'match',
    patient: '利用者D',
    focus: 'scheduleEnd',
    before: async (cells) => {
      await expect(cells.nth(BEFORE_COLUMN.scheduleEnd)).toHaveText('13:44 ※')
      await expect(cells.nth(BEFORE_COLUMN.scheduleDuration)).toHaveText('44 ※ (30~59)')
    },
    beforeResult: '提供時間と終了時間に記号の「※」が付き、何が違うかの文は無い',
    after: async (cells) => {
      await expect(findings(cells)).toHaveText(['提供時間が予定と違う', '終了時間が予定と違う'])
      await expect(cells.nth(COLUMN.scheduleEnd)).toHaveText('13:44（注意）')
      await expect(cells.nth(COLUMN.scheduleDuration)).toHaveText('44（注意）範囲 30〜59 分')
      await expect(cells.nth(COLUMN.visitEnd)).toHaveText('13:50（注意）')
      await expect(cells.nth(COLUMN.visitDuration)).toHaveText('50（注意）範囲 30〜59 分')
    },
    afterResult:
      '両側の提供時間と終了時間に注意のアイコンが付き、確認することの列に 2 つの文が出る',
  },
  {
    name: 'receipt-marks-one-side',
    test: '予定のみと実績のみの行がある場合、確認することに実績が無いと予定が無いが出ること',
    title: '予定のみの利用者E と、実績のみの利用者F の行を見る',
    category: 'schedule_only',
    patient: '利用者E',
    focus: 'scheduleStart',
    before: async (cells) => {
      await expect(cells.nth(BEFORE_COLUMN.scheduleStart)).toHaveText('14:00')
    },
    beforeResult: '予定のみの行に、確認することの文は無い',
    after: async (cells) => {
      await expect(findings(cells)).toHaveText(['実績が無い'])
      await expect(cells.nth(COLUMN.visitStart)).toHaveText('データなし')
    },
    afterResult:
      '予定のみの行の確認することに「実績が無い」が、実績のみの行に「予定が無い」が出て、無い側のセルは空のままである',
  },
]

test.describe('照合の結果', () => {
  test.describe('食い違いの印', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      for (const item of ITEMS) {
        test(`${prefix}${item.test}`, async ({ browser }, testInfo) => {
          const schedules = testInfo.outputPath('schedules.csv')
          const visits = testInfo.outputPath('visits.csv')
          await writeFile(schedules, SCHEDULES)
          await writeFile(visits, VISITS)
          await recordPrEvidence(
            browser,
            { name: item.name, title: item.title, actor: ACTOR, variant },
            signIn,
            async ({ page, step, check }) => {
              await page.goto('/receipt')
              await step(
                '照合の画面を開いている。予定と実績のダミーの CSV は、利用者A から F の行を持つ',
              )

              await step('予定の CSV と実績の CSV を選び、照合する')
              await page.getByTestId('receipt-source-csv').check()
              await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
              await page.getByTestId('receipt-visits-file').setInputFiles(visits)
              await page.getByTestId('receipt-check-submit').click()
              await expect(page).toHaveURL(/\/receipt\/result$/)

              const cells = receiptCategoryRowCells(page, item.category, '2024-04-01', item.patient)
              await step(`結果の表で、${item.patient} の行の観点のセルが見えるまで送る`)
              const focus = isBefore ? BEFORE_COLUMN[item.focus] : COLUMN[item.focus]
              await cells.nth(focus).scrollIntoViewIfNeeded()
              if (isBefore) {
                await item.before(cells)
                await check(item.beforeResult)
                return
              }
              await item.after(cells)
              if (item.name === 'receipt-marks-one-side') {
                const visitOnly = receiptCategoryRowCells(
                  page,
                  'visit_only',
                  '2024-04-01',
                  '利用者F',
                )
                await expect(findings(visitOnly)).toHaveText(['予定が無い'])
              }
              await check(item.afterResult)
            },
          )
        })
      }
    }
  })
})
