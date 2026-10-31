import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { calendarColumnHeader } from '../../selectors/scheduleCalendar'

test.describe('予定のカレンダー', () => {
  test.describe('日付と絞り込みのドロワー', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}スマートフォンの幅でツールバーの「日付と絞り込み」のボタンを押した場合、日付と絞り込みのドロワーにミニカレンダーと職員の絞り込みが出て、職員を外して閉じるとその職員の列が消えること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-sidebar-drawer',
            title:
              'スマートフォンの幅で、ツールバーのボタンからドロワーを開き、職員を外して、閉じるボタンと Escape で閉じる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            const drawer = page.getByTestId('site-sidebar-drawer')
            await expect(drawer).toBeHidden()
            await check('幅 390px で日の表示を開くと、日付と絞り込みのドロワーは閉じている')

            await step('ツールバーの「日付と絞り込み」のボタンを押す')
            await page.getByTestId('site-sidebar-open').click()
            await expect(drawer).toBeVisible()
            await expect(drawer.getByTestId('mini-calendar')).toBeVisible()
            await expect(drawer.getByTestId('calendar-show-cancelled')).toBeVisible()
            await expect(drawer.getByTestId('staff-filter-sidebar')).toBeVisible()
            await check(
              '左端から日付と絞り込みのドロワーが開き、ミニカレンダー、キャンセルした予定を出す、職員の絞り込みが出る',
            )

            await step(`${LOGIN_STAFF.name} のチェックを外し、閉じるボタンを押す`)
            await drawer.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`).uncheck()
            await page.getByTestId('site-sidebar-close').click()
            await expect(drawer).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LEADER.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeHidden()
            await check(`ドロワーが閉じ、日の表示から ${LOGIN_STAFF.name} の列が消える`)

            await step('もう一度「日付と絞り込み」のボタンを押して開き、Escape キーを押す')
            await page.getByTestId('site-sidebar-open').click()
            await expect(drawer).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(drawer).toBeHidden()
            await check('Escape キーでドロワーが閉じる')
          },
        )
      })

      test(`${variant.label ? `${variant.label}: ` : ''}PC の幅でツールバーの「日付と絞り込み」のボタンを押した場合、左の欄をたたんでカレンダーを広げ、もう一度押すと開くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-sidebar-collapse',
            title: 'PC の幅で、ツールバーのボタンから左の欄をたたみ、もう一度開く',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            const toggle = page.getByTestId('site-sidebar-open')
            const columnWidth = async () =>
              (await calendarColumnHeader(page, '土').boundingBox())?.width ?? 0
            await expect(page.getByTestId('mini-calendar')).toBeVisible()
            await expect(toggle).toHaveAttribute('aria-expanded', 'true')
            const openColumnWidth = await columnWidth()
            await check(
              '幅 1280px で予定のカレンダーを開くと、左の欄にミニカレンダーと職員の絞り込みが出ている',
            )

            await step('ツールバーの「日付と絞り込み」のボタンを押す')
            await toggle.click()
            await expect(toggle).toHaveAttribute('aria-expanded', 'false')
            await expect(page.getByTestId('mini-calendar')).toBeHidden()
            await expect(page.getByTestId('staff-filter-sidebar')).toBeHidden()
            // 左の欄の 288px を 7 列で分けた分（約 41px）だけ、列が広がる
            await expect.poll(columnWidth).toBeGreaterThan(openColumnWidth + 30)
            await check('左の欄がたたまれ、カレンダーが左の欄の分だけ広がる')

            await step('もう一度「日付と絞り込み」のボタンを押す')
            await toggle.click()
            await expect(toggle).toHaveAttribute('aria-expanded', 'true')
            await expect(page.getByTestId('mini-calendar')).toBeVisible()
            await expect(page.getByTestId('staff-filter-sidebar')).toBeVisible()
            await check('左の欄が開き、ミニカレンダーと職員の絞り込みが出る')
          },
        )
      })
    }
  })
})
