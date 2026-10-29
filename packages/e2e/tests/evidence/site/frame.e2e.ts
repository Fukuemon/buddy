import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { brokerLogin } from '../../selectors/idp'
import { calendarColumnHeader } from '../../selectors/scheduleCalendar'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

// 枠だけでなく、月の格子の列も広がったかを見るため、土曜の列の見出しの幅を測る
const columnWidth = async (page: Page) =>
  (await calendarColumnHeader(page, '土').boundingBox())?.width ?? 0

test.describe('画面の枠', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}PC の幅で予定のカレンダーを開いた場合、左の欄にミニカレンダーと職員の絞り込みが並び、ヘッダーに予定の名前が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-sidebar-schedule',
          title: 'PC の幅で予定のカレンダーを開き、左の欄とヘッダーを見る',
          actor: MANAGER,
          variant,
        },
        signIn,
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-calendar')).toBeVisible()
          await step('幅 1280px で予定のカレンダーを開いている')
          await expect(page.getByTestId('site-title')).toHaveText('予定')
          await expect(page.getByTestId('mini-calendar')).toBeVisible()
          await expect(page.getByTestId('staff-filter-sidebar')).toBeVisible()
          await check(
            '左の欄に、ミニカレンダー、キャンセルした予定の切り替え、職員の絞り込みだけが並ぶ。ヘッダーの左に「予定」の名前が出る',
          )
        },
      )
    })

    test(`${prefix}PC の幅でメニューのボタンを押した場合、左の欄を閉じてカレンダーを広げ、もう一度押すと開くこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-sidebar-toggle',
          title: 'PC の幅で、ヘッダーのメニューのボタンで左の欄を閉じて開く',
          actor: MANAGER,
          variant,
        },
        signIn,
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          const opener = page.getByTestId('site-sidebar-open')
          await expect(page.getByTestId('mini-calendar')).toBeVisible()
          const openWidth = await columnWidth(page)
          await step('幅 1280px で予定のカレンダーを開いている。左の欄は開いている')

          await step('ヘッダーの左のメニューのボタンを押す')
          await opener.click()
          await expect(opener).toHaveAttribute('aria-expanded', 'false')
          await expect(page.getByTestId('mini-calendar')).toBeHidden()
          // 左の欄の幅 256px を 7 列で分けた分（約 36px）だけ、列が広がる
          await expect.poll(() => columnWidth(page)).toBeGreaterThan(openWidth + 30)
          await check('左の欄が閉じ、カレンダーが表示の幅いっぱいに広がる')

          await step('もう一度メニューのボタンを押す')
          await opener.click()
          await expect(opener).toHaveAttribute('aria-expanded', 'true')
          await expect(page.getByTestId('mini-calendar')).toBeVisible()
          await check('左の欄が開き、ミニカレンダーと職員の絞り込みがもう一度出る')
        },
      )
    })

    test(`${prefix}アカウントのボタンを押した場合、名前とログアウトを入れたメニューが開き、ログアウトを押すとログインの画面に移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'viewer-menu',
          title: 'ヘッダーの右端のアカウントのボタンからメニューを開き、ログアウトする',
          actor: MANAGER,
          variant,
        },
        signIn,
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          const logout = page.getByTestId('viewer-logout')
          await expect(page.getByTestId('viewer-menu-open')).toBeVisible()
          await expect(logout).toBeHidden()
          await step(
            '予定のカレンダーを開いている。ヘッダーの右端には、名前の頭文字の丸いボタンだけがある',
          )

          await step('アカウントのボタンを押す')
          await page.getByTestId('viewer-menu-open').click()
          await expect(logout).toBeVisible()
          await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
          await check('ボタンの下に、職員の名前とログアウトのボタンを入れたメニューが開く')

          await step('メニューの「ログアウト」を押す')
          await logout.click()
          await expect(brokerLogin(page).email).toBeVisible()
          await check('ログアウトし、ログインの画面に移る')
        },
      )
    })
  }
})
