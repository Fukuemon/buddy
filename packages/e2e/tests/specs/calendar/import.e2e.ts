import { expect, test } from '@playwright/test'

import { LEADER, SEED_PATIENT } from '../../fixtures/env'

// compose の偽物の Google（compose/fake-google-calendar.json）は、森のカレンダーに 2026 年 11 月の予定を持つ。
const MORI = LEADER.staff
const MORI_CALENDAR = 'kenta.mori@example.com'

test.describe('予定の取り込み', () => {
  test.describe('Google カレンダーの取り込み', () => {
    test('職員にカレンダーを結び付けて期間を取り込んだ場合、繰り返しの回がカレンダーに出て、2 回目の下見は全て取り込み済みになること', async ({
      page,
    }) => {
      await test.step('読めないカレンダーは結び付けられず、森のカレンダーは結び付けられる', async () => {
        await page.goto('/schedule/link')
        await page.getByTestId(`calendar-link-open-${MORI.id}`).click()
        const dialog = page.getByTestId('calendar-link-dialog')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('calendar-link-input')).toHaveValue(MORI_CALENDAR)

        await page.getByTestId('calendar-link-input').fill('nobody@example.com')
        await page.getByTestId('calendar-link-check').click()
        await expect(page.getByTestId('calendar-link-check-result')).toContainText(
          'このカレンダーを読めません。',
        )
        await expect(page.getByTestId('calendar-link-submit')).toBeDisabled()

        await page.getByTestId('calendar-link-input').fill(MORI_CALENDAR)
        await page.getByTestId('calendar-link-check').click()
        await expect(page.getByTestId('calendar-link-check-result')).toContainText('読めました。')
        await page.getByTestId('calendar-link-submit').click()
        await expect(dialog).toBeHidden()
        await expect(page.getByTestId(`calendar-link-calendar-id-${MORI.id}`)).toHaveText(
          MORI_CALENDAR,
        )
      })

      await test.step('11 月を下見すると、件数と取り込まない理由が出る', async () => {
        await page.getByTestId(`calendar-link-import-${MORI.id}`).click()
        await expect(page).toHaveURL(/\/schedule\/import/)
        await expect(page.getByTestId('calendar-import-staff')).toHaveValue(MORI.id)
        await page.getByTestId('calendar-import-start').fill('2026-11-01')
        await page.getByTestId('calendar-import-end').fill('2026-11-30')
        await page.getByTestId('calendar-import-preview').click()

        await expect(page.getByTestId('calendar-import-count-import')).toContainText('6 件')
        await expect(page.getByTestId('calendar-import-count-recurring')).toContainText('2 件')
        await expect(page.getByTestId('calendar-import-count-needs_review')).toContainText('1 件')
        await expect(page.getByTestId('calendar-import-count-skipped')).toContainText('3 件')
        await expect(page.getByTestId('calendar-import-skipped-reason-all_day')).toHaveText(
          '終日の予定: 1 件',
        )
        await expect(page.getByTestId('calendar-import-skipped-reason-multi_day')).toHaveText(
          '日をまたぐ予定: 1 件',
        )
        await expect(
          page.getByTestId('calendar-import-skipped-reason-service_not_found'),
        ).toHaveText('サービス内容を引けない予定: 1 件')
        // 取り込まない予定の一覧は、利用者名を含む題名を出さない
        await expect(page.getByTestId('calendar-import-skipped')).not.toContainText('見本')
      })

      await test.step('確かめが要る予定に利用者を選んで確定すると、取り込んだ件数が出る', async () => {
        await expect(page.getByTestId('calendar-import-submit')).toBeDisabled()
        await page.getByTestId('calendar-import-review-normal-unknown1110').check()
        await page.getByTestId('calendar-import-review-patient-unknown1110').check()
        await expect(
          page.getByTestId('calendar-import-review-normal-unknown1110'),
        ).not.toBeChecked()
        await page
          .getByTestId('calendar-import-review-patient-select-unknown1110')
          .selectOption(SEED_PATIENT.id)
        await expect(page.getByTestId('calendar-import-remaining')).toBeHidden()
        await page.getByTestId('calendar-import-submit').click()

        await expect(page.getByTestId('calendar-import-result')).toBeVisible()
        await expect(page.getByTestId('calendar-import-result-counts')).toContainText('7 件')
      })

      await test.step('カレンダーに毎週水曜の回が出て、取り消した回と変えた回は元の時刻に出ない', async () => {
        await page.getByTestId('calendar-import-open-calendar').click()
        await expect(page).toHaveURL(/\/schedule\?/)
        await expect(page.getByTestId(/^schedule-event-.+-2026-11-25$/)).toBeVisible()
        await expect(page.getByTestId(/^schedule-event-.+-2026-11-04$/)).toBeVisible()
        // 繰り返しの回の ID は日付で終わる。11-11 は取り消した回、11-18 は 14:00 の単発の予定に置き換えた回である
        await expect(page.getByTestId(/^schedule-event-.+-2026-11-11$/)).toHaveCount(0)
        await expect(page.getByTestId(/^schedule-event-.+-2026-11-18$/)).toHaveCount(0)
      })

      await test.step('同じ期間をもう一度下見すると、全て取り込み済みになる', async () => {
        await page.goto(`/schedule/import?staff=${MORI.id}`)
        await page.getByTestId('calendar-import-start').fill('2026-11-01')
        await page.getByTestId('calendar-import-end').fill('2026-11-30')
        await page.getByTestId('calendar-import-preview').click()
        await expect(page.getByTestId('calendar-import-all-imported')).toBeVisible()
        await expect(page.getByTestId('calendar-import-count-already_imported')).toContainText(
          '7 件',
        )
      })
    })
  })
})
