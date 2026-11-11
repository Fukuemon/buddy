import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { calendarColumnHeader } from '../../selectors/scheduleCalendar'

test.describe('予定のカレンダー', () => {
  test.describe(`日付と絞り込みのドロワー（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test.describe('スマートフォンの幅', () => {
      test.use({ viewport: PHONE_VIEWPORT })

      test('schedule-sidebar-drawer スマートフォンの幅でツールバーの「日付と絞り込み」のボタンを押した場合、日付と絞り込みのドロワーにミニカレンダーと職員の絞り込みが出て、職員を外して閉じるとその職員の列が消えること', async ({
        page,
      }) => {
        await page.goto('/schedule?view=day')
        await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
        const drawer = page.getByTestId('site-sidebar-drawer')
        await intro(
          page,
          'スマートフォンの幅で、ツールバーのボタンからドロワーを開き、職員を外して、閉じるボタンと Escape で閉じる',
        )
        await check(page, '幅 390px で日の表示を開くと、日付と絞り込みのドロワーは閉じている', () =>
          expect(drawer).toBeHidden(),
        )

        await step(page, 'ツールバーの「日付と絞り込み」のボタンを押す', () =>
          page.getByTestId('site-sidebar-open').click(),
        )
        await check(
          page,
          '左端から日付と絞り込みのドロワーが開き、ミニカレンダー、キャンセルした予定を出す、職員の絞り込みが出る',
          async () => {
            await expect(drawer).toBeVisible()
            await expect(drawer.getByTestId('mini-calendar')).toBeVisible()
            await expect(drawer.getByTestId('calendar-show-cancelled')).toBeVisible()
            await expect(drawer.getByTestId('staff-filter-sidebar')).toBeVisible()
          },
        )

        await step(page, `${LOGIN_STAFF.name} のチェックを外し、閉じるボタンを押す`, async () => {
          await drawer.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`).uncheck()
          await page.getByTestId('site-sidebar-close').click()
        })
        await check(
          page,
          `ドロワーが閉じ、日の表示から ${LOGIN_STAFF.name} の列が消える`,
          async () => {
            await expect(drawer).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LEADER.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeHidden()
          },
        )

        await step(
          page,
          'もう一度「日付と絞り込み」のボタンを押して開き、Escape キーを押す',
          async () => {
            await page.getByTestId('site-sidebar-open').click()
            await expect(drawer).toBeVisible()
            await page.keyboard.press('Escape')
          },
        )
        await check(page, 'Escape キーでドロワーが閉じる', () => expect(drawer).toBeHidden())
      })
    })

    test('schedule-sidebar-collapse PC の幅でツールバーの「日付と絞り込み」のボタンを押した場合、左の欄をたたんでカレンダーを広げ、もう一度押すと開くこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      const toggle = page.getByTestId('site-sidebar-open')
      const columnWidth = async () =>
        (await calendarColumnHeader(page, '土').boundingBox())?.width ?? 0
      await expect(page.getByTestId('mini-calendar')).toBeVisible()
      await intro(page, 'PC の幅で、ツールバーのボタンから左の欄をたたみ、もう一度開く')
      await check(
        page,
        '幅 1280px で予定のカレンダーを開くと、左の欄にミニカレンダーと職員の絞り込みが出ている',
        () => expect(toggle).toHaveAttribute('aria-expanded', 'true'),
      )
      const openColumnWidth = await columnWidth()

      await step(page, 'ツールバーの「日付と絞り込み」のボタンを押す', () => toggle.click())
      await check(page, '左の欄がたたまれ、カレンダーが左の欄の分だけ広がる', async () => {
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await expect(page.getByTestId('mini-calendar')).toBeHidden()
        await expect(page.getByTestId('staff-filter-sidebar')).toBeHidden()
        // 左の欄の 288px を 7 列で分けた分（約 41px）だけ、列が広がる
        await expect.poll(columnWidth).toBeGreaterThan(openColumnWidth + 30)
      })

      await step(page, 'もう一度「日付と絞り込み」のボタンを押す', () => toggle.click())
      await check(page, '左の欄が開き、ミニカレンダーと職員の絞り込みが出る', async () => {
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await expect(page.getByTestId('mini-calendar')).toBeVisible()
        await expect(page.getByTestId('staff-filter-sidebar')).toBeVisible()
      })
    })

    test.describe('幅 768px', () => {
      test.use({ viewport: { width: 768, height: 800 } })

      test('schedule-sidebar-breakpoint 幅 768px と 767px で予定のカレンダーを開いた場合、768px では左の欄とレールが出て、767px ではドロワーに切り替わること', async ({
        page,
      }) => {
        await page.goto('/schedule')
        const drawer = page.getByTestId('site-sidebar-drawer')
        await expect(page.getByTestId('mini-calendar')).toBeVisible()
        await intro(
          page,
          '幅 768px では左の欄とレール、767px ではドロワーで、幅を戻すと左の欄に戻る',
        )
        await check(
          page,
          '幅 768px では、左の欄にミニカレンダーと職員の絞り込みが出て、ナビゲーションがレールで出る',
          async () => {
            await expect(drawer).toBeHidden()
            await expect(page.getByTestId('site-nav')).toBeVisible()
          },
        )

        await step(page, '表示の幅を 767px にする', () =>
          page.setViewportSize({ width: 767, height: 800 }),
        )
        await check(page, '左の欄とナビゲーションが消える', async () => {
          await expect(page.getByTestId('mini-calendar')).toBeHidden()
          await expect(page.getByTestId('site-nav')).toBeHidden()
        })

        await step(page, 'ツールバーの「日付と絞り込み」のボタンを押す', () =>
          page.getByTestId('site-sidebar-open').click(),
        )
        await check(page, '日付と絞り込みが、左端からドロワーで開く', async () => {
          await expect(drawer).toBeVisible()
          await expect(drawer.getByTestId('mini-calendar')).toBeVisible()
        })

        await step(page, 'Escape キーで閉じ、表示の幅を 768px に戻す', async () => {
          await page.keyboard.press('Escape')
          await expect(drawer).toBeHidden()
          await page.setViewportSize({ width: 768, height: 800 })
        })
        await check(page, '左の欄にミニカレンダーと職員の絞り込みが戻る', () =>
          expect(page.getByTestId('mini-calendar')).toBeVisible(),
        )
      })
    })
  })
})
