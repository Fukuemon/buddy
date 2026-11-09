import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { brokerLogin } from '../../selectors/idp'
import { calendarColumnHeader } from '../../selectors/scheduleCalendar'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

const navWidth = async (page: Page) =>
  (await page.getByTestId('site-nav').boundingBox())?.width ?? 0

// 枠だけでなく、月の格子の列も狭まったかを見るため、土曜の列の見出しの幅を測る
const columnWidth = async (page: Page) =>
  (await calendarColumnHeader(page, '土').boundingBox())?.width ?? 0

test.describe('画面の枠', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}PC の幅で予定のカレンダーを開いた場合、ナビゲーションをレールで出し、その右の欄にミニカレンダーと職員の絞り込みが並ぶこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-schedule',
          title: 'PC の幅で予定のカレンダーを開き、ナビゲーションと左の欄を見る',
          actor: MANAGER,
          variant,
        },
        signIn,
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-calendar')).toBeVisible()
          await step('幅 1280px で予定のカレンダーを開いている')
          await expect(page.getByTestId('site-nav-toggle')).toHaveAttribute(
            'aria-expanded',
            'false',
          )
          await expect.poll(() => navWidth(page)).toBeLessThan(100)
          await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
            'aria-current',
            'page',
          )
          await expect(page.getByTestId('mini-calendar')).toBeVisible()
          await expect(page.getByTestId('staff-filter-sidebar')).toBeVisible()
          await check(
            '左端のレールに、アイコンと名前のカレンダー、取り込み、要確認、連携、照合が並び、カレンダーに印が付く。その右の欄に、ミニカレンダー、キャンセルした予定の切り替え、職員の絞り込みが並ぶ',
          )
        },
      )
    })

    test(`${prefix}PC の幅でメニューのボタンを押した場合、ナビゲーションを見出し付きの形に開き、もう一度押すとレールにたたむこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-toggle',
          title: 'PC の幅で、ヘッダーのメニューのボタンでナビゲーションを開いてたたむ',
          actor: MANAGER,
          variant,
        },
        signIn,
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          const toggle = page.getByTestId('site-nav-toggle')
          await expect(page.getByTestId('mini-calendar')).toBeVisible()
          const railColumnWidth = await columnWidth(page)
          await step('幅 1280px で予定のカレンダーを開いている。ナビゲーションはレールである')

          await step('ヘッダーの左のメニューのボタンを押す')
          await toggle.click()
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await expect.poll(() => navWidth(page)).toBeGreaterThan(200)
          // ナビゲーションが 144px 広がった分を 7 列で分けた分（約 20px）だけ、列が狭まる
          await expect.poll(() => columnWidth(page)).toBeLessThan(railColumnWidth - 15)
          await check(
            'ナビゲーションが開き、「予定」「照合」の見出しの下に画面の名前が並ぶ。カレンダーはその分だけ狭まる',
          )

          await step('もう一度メニューのボタンを押す')
          await toggle.click()
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
          await expect.poll(() => navWidth(page)).toBeLessThan(100)
          await check('ナビゲーションがレールにたたまれる')
        },
      )
    })

    test(`${prefix}スマートフォンの幅でメニューのボタンを押した場合、ナビゲーションのドロワーが開くこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-drawer',
          title:
            'スマートフォンの幅で、ヘッダーのメニューのボタンからナビゲーションのドロワーを開いて閉じる',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signIn,
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-calendar')).toBeVisible()
          await expect(page.getByTestId('site-nav')).toBeHidden()
          await step('幅 390px で予定のカレンダーを開いている。ナビゲーションは出ていない')

          await step('ヘッダーの左のメニューのボタンを押す')
          await page.getByTestId('site-nav-toggle').click()
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await expect(page.getByTestId('site-nav-receipt')).toBeVisible()
          await check('左端からドロワーが開き、「予定」「照合」の見出しの下に画面の名前が並ぶ')

          await step('ドロワーの閉じるボタンを押す')
          await page.getByTestId('site-nav-close').click()
          await expect(page.getByTestId('site-nav')).toBeHidden()
          await check('ドロワーが閉じる')
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
          await expect(page.getByTestId('viewer-menu-open')).toContainText(LOGIN_STAFF.name)
          await expect(logout).toBeHidden()
          await step(
            '予定のカレンダーを開いている。ヘッダーの右端に、名前の頭文字の丸と名前を並べたボタンがある',
          )

          await step('アカウントのボタンを押す')
          await page.getByTestId('viewer-menu-open').click()
          await expect(logout).toBeVisible()
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
