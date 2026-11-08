import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'
import { pageBody } from '../../selectors/page'

// compose の calendarpit（compose/calendarpit/fixture.json）は、森のカレンダーに 2026 年 11 月の予定を持つ。
const MORI = LEADER.staff
const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** ログインして、森にカレンダーを結び付ける。取り込みの画面は、結び付けた職員だけを選べる。 */
const prepareMoriLinked = async (page: Page) => {
  await page.goto('/schedule/link')
  await signInAtBroker(page, LOGIN_EMAIL)
  await linkStaffCalendar(page, MORI.id)
}

test.describe('予定の取り込み', () => {
  test.describe('Google カレンダーの取り込み', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}職員のカレンダーの期間をプレビューした場合、取り込む件数と取り込まない理由が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-preview',
            title:
              '森 健太のカレンダーの 2026 年 11 月を「プレビューする」と、「プレビューの結果」に取り込む件数と取り込まない理由が出る',
            actor: ACTOR,
            variant,
          },
          prepareMoriLinked,
          async ({ page, step, check }) => {
            try {
              await page.goto(`/schedule/import?staff=${MORI.id}`)
              await expect(page.getByTestId('calendar-import-staff')).toHaveValue(MORI.id)
              await step(
                `予定の取り込みの画面で、${MORI.name} を選んでいる（${MORI.name} にはカレンダーを結び付けてある）`,
              )

              await step('期間を 2026-11-01 から 2026-11-30 にして、「プレビューする」を押す')
              await page.getByTestId('calendar-import-start').fill('2026-11-01')
              await page.getByTestId('calendar-import-end').fill('2026-11-30')
              await expect(page.getByTestId('calendar-import-preview')).toHaveText('プレビューする')
              await page.getByTestId('calendar-import-preview').click()
              await expect(page.getByTestId('calendar-import-result-preview')).toContainText(
                'プレビューの結果',
              )
              await expect(page.getByTestId('calendar-import-count-import')).toContainText('6 件')
              await expect(page.getByTestId('calendar-import-count-recurring')).toContainText(
                '2 件',
              )
              await expect(page.getByTestId('calendar-import-count-needs_review')).toContainText(
                '1 件',
              )
              await expect(page.getByTestId('calendar-import-skipped-heading')).toHaveText(
                '取り込まない予定（3 件）',
              )
              await check(
                '「プレビューの結果」に、取り込む 6 件、繰り返し 2 件、確認が必要 1 件が出て、取り込まない 3 件は表の見出しに出る',
              )

              await step('取り込まない予定の理由と、確認が必要な予定を見る')
              await page.getByTestId('calendar-import-skipped').scrollIntoViewIfNeeded()
              const skipped = page.getByTestId('calendar-import-skipped')
              await expect(skipped).toContainText('終日の予定')
              await expect(skipped).toContainText('日をまたぐ予定')
              await expect(skipped).toContainText('サービス内容を引けない予定')
              await expect(page.getByTestId('calendar-import-result-preview')).toContainText(
                'タイトルから読んだ利用者',
              )
              await check(
                '取り込まない予定の表に、理由（終日、日をまたぐ、サービス内容を引けない）が 1 件ずつ出て、確認が必要な予定に「タイトルから読んだ利用者」が出る',
              )
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, MORI.id)
            }
          },
        )
      })

      test(`${prefix}繰り返しの予定を含む期間をプレビューした場合、件数の文に内部の処理の語が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-recurring-wording',
            title:
              '毎週と 14 日ごとの繰り返しを含む森 健太の 2026 年 11 月をプレビューすると、件数の文が「繰り返しとして」「1 回ずつに分ける」の語で出て、「回ごと」「繰り返しのまま」が出ない',
            actor: ACTOR,
            variant,
          },
          prepareMoriLinked,
          async ({ page, step, check }) => {
            try {
              await page.goto(`/schedule/import?staff=${MORI.id}`)
              await expect(page.getByTestId('calendar-import-staff')).toHaveValue(MORI.id)
              await expect(pageBody(page)).toContainText(
                '職員の Google カレンダーの予定を、期間を選んで buddy に取り込みます。',
              )
              await step(
                `予定の取り込みの画面で、${MORI.name} を選んでいる。カレンダーには毎週水曜と 14 日ごとの金曜の繰り返しの予定がある`,
              )
              await check(
                '説明は「職員の Google カレンダーの予定を、期間を選んで buddy に取り込みます。」の 1 文',
              )

              await step('期間を 2026-11-01 から 2026-11-30 にして、「プレビューする」を押す')
              await page.getByTestId('calendar-import-start').fill('2026-11-01')
              await page.getByTestId('calendar-import-end').fill('2026-11-30')
              await page.getByTestId('calendar-import-preview').click()
              const importCount = page.getByTestId('calendar-import-count-import')
              const recurring = page.getByTestId('calendar-import-count-recurring')
              await expect(importCount).toContainText('繰り返しの予定を 1 回ずつに分けた')
              await expect(recurring).toContainText('繰り返しとして 1 件、1 回ずつに分ける 1 件')
              await expect(page.getByTestId('calendar-import-result-preview')).not.toContainText(
                /回ごと|繰り返しのまま/,
              )
              await check(
                '「取り込む」に「繰り返しの予定を 1 回ずつに分けた」件数が、「繰り返し」に「繰り返しとして 1 件、1 回ずつに分ける 1 件」が出て、「回ごと」「繰り返しのまま」は出ない',
              )
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, MORI.id)
            }
          },
        )
      })

      test(`${prefix}確認が必要な予定に利用者を選んで確定した場合、取り込んだ件数が出て、カレンダーに取り込んだ予定が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-confirm',
            title:
              '確認が必要な予定に利用者を選んで「確定して取り込む」と、取り込んだ件数が出て、カレンダーに取り込んだ予定が出る',
            actor: ACTOR,
            variant,
          },
          prepareMoriLinked,
          async ({ page, step, check }) => {
            try {
              await page.goto(`/schedule/import?staff=${MORI.id}`)
              await page.getByTestId('calendar-import-start').fill('2026-11-01')
              await page.getByTestId('calendar-import-end').fill('2026-11-30')
              await page.getByTestId('calendar-import-preview').click()
              await expect(page.getByTestId('calendar-import-submit')).toBeDisabled()
              await step(
                `${MORI.name} の 2026 年 11 月をプレビューした。確認が必要な予定が 1 件あり、「確定して取り込む」は押せない`,
              )

              await step(
                `確認が必要な予定で「利用者を選ぶ」を選び、利用者に ${SEED_PATIENT.name} を選ぶ`,
              )
              await page.getByTestId('calendar-import-review-patient-unknown1110').check()
              await page
                .getByTestId('calendar-import-review-patient-select-unknown1110')
                .selectOption(SEED_PATIENT.id)
              await expect(page.getByTestId('calendar-import-remaining')).toBeHidden()
              await expect(page.getByTestId('calendar-import-submit')).toBeEnabled()
              await check('「確定して取り込む」を押せるようになる')

              await step('「確定して取り込む」を押す')
              await page.getByTestId('calendar-import-submit').click()
              await expect(page.getByTestId('calendar-import-result-counts')).toContainText('7 件')
              await check('取り込んだ件数（7 件）が出る')

              await step('「予定のカレンダーで見る」を押す')
              await page.getByTestId('calendar-import-open-calendar').click()
              await expect(page.getByTestId(/^schedule-event-.+-2026-11-04$/)).toBeVisible()
              await expect(page.getByTestId(/^schedule-event-.+-2026-11-25$/)).toBeVisible()
              await check('カレンダーの 2026 年 11 月に、取り込んだ毎週水曜の繰り返しの予定が出る')
            } finally {
              await step(
                '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す。取り込んだ予定は残る）',
              )
              await unlinkStaffCalendar(page, MORI.id)
            }
          },
        )
      })
    }
  })
})
