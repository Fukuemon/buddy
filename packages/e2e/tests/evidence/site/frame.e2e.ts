import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { PHONE_VIEWPORT, prepareOutsideRecording } from '../../fixtures/recording'
import { brokerLogin } from '../../selectors/idp'
import { calendarColumnHeader } from '../../selectors/scheduleCalendar'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

const navWidth = async (page: Page) =>
  (await page.getByTestId('site-nav').boundingBox())?.width ?? 0

// 枠だけでなく、月の格子の列も狭まったかを見るため、土曜の列の見出しの幅を測る
const columnWidth = async (page: Page) =>
  (await calendarColumnHeader(page, '土').boundingBox())?.width ?? 0

/**
 * 録画の外で青木 陽菜でログインし、cookie を context に移す。
 * ログアウトの spec は、setup が保存したログインの状態を使わない。ログアウトでそのセッションを消すと、同じ実行の後の spec がログインできなくなるためである。
 */
const signInOutsideRecording = (browser: Browser, context: BrowserContext) =>
  prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, LOGIN_EMAIL)
    await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
  })

test.describe('画面の枠', () => {
  test.describe(MANAGER, () => {
    test.use({ storageState: LOGIN_STATE })

    test('site-nav-schedule PC の幅で予定のカレンダーを開いた場合、ナビゲーションをレールで出し、その右の欄にミニカレンダーと職員の絞り込みが並ぶこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('schedule-calendar')).toBeVisible()
      await intro(
        page,
        'PC の幅で予定のカレンダーを開き、ナビゲーションと左の欄を見る\n前提 幅 1280px で予定のカレンダーを開いている',
      )

      await check(
        page,
        '左端のレールに、アイコンと名前のカレンダー、取り込み、要確認、連携、照合が並び、カレンダーに印が付く。その右の欄に、ミニカレンダー、キャンセルした予定の切り替え、職員の絞り込みが並ぶ',
        async () => {
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
        },
        { position: 'bottom' },
      )
    })

    test('site-nav-toggle PC の幅でメニューのボタンを押した場合、ナビゲーションを見出し付きの形に開き、もう一度押すとレールにたたむこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      const toggle = page.getByTestId('site-nav-toggle')
      await expect(page.getByTestId('mini-calendar')).toBeVisible()
      const railColumnWidth = await columnWidth(page)
      await intro(
        page,
        'PC の幅で、ヘッダーのメニューのボタンでナビゲーションを開いてたたむ\n前提 幅 1280px で予定のカレンダーを開いている。ナビゲーションはレールである',
      )

      await step(page, 'ヘッダーの左のメニューのボタンを押す', () => toggle.click(), {
        position: 'bottom',
      })
      await check(
        page,
        'ナビゲーションが開き、「予定」「照合」の見出しの下に画面の名前が並ぶ。カレンダーはその分だけ狭まる',
        async () => {
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await expect.poll(() => navWidth(page)).toBeGreaterThan(200)
          // ナビゲーションが 144px 広がった分を 7 列で分けた分（約 20px）だけ、列が狭まる
          await expect.poll(() => columnWidth(page)).toBeLessThan(railColumnWidth - 15)
        },
        { position: 'bottom' },
      )

      await step(page, 'もう一度メニューのボタンを押す', () => toggle.click(), {
        position: 'bottom',
      })
      await check(
        page,
        'ナビゲーションがレールにたたまれる',
        async () => {
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
          await expect.poll(() => navWidth(page)).toBeLessThan(100)
        },
        { position: 'bottom' },
      )
    })
  })

  test.describe(`${MANAGER}、録画の外でログインし直す`, () => {
    test('viewer-menu アカウントのボタンを押した場合、名前とログアウトを入れたメニューが開き、ログアウトを押すとログインの画面に移ること', async ({
      browser,
      context,
    }) => {
      await signInOutsideRecording(browser, context)
      const page = await context.newPage()
      await page.goto('/schedule')
      const logout = page.getByTestId('viewer-logout')
      await expect(page.getByTestId('viewer-menu-open')).toContainText(LOGIN_STAFF.name)
      await expect(logout).toBeHidden()
      await intro(
        page,
        'ヘッダーの右端のアカウントのボタンからメニューを開き、ログアウトする\n前提 予定のカレンダーを開いている。ヘッダーの右端に、名前の頭文字の丸と名前を並べたボタンがある',
      )

      await step(
        page,
        'アカウントのボタンを押す',
        () => page.getByTestId('viewer-menu-open').click(),
        { position: 'bottom' },
      )
      await check(
        page,
        'ボタンの下に、職員の名前とログアウトのボタンを入れたメニューが開く',
        () => expect(logout).toBeVisible(),
        { position: 'bottom' },
      )

      await step(page, 'メニューの「ログアウト」を押す', () => logout.click(), {
        position: 'bottom',
      })
      await check(page, 'ログアウトし、ログインの画面に移る', () =>
        expect(brokerLogin(page).email).toBeVisible(),
      )
    })
  })

  test.describe(`${MANAGER}、スマートフォンの幅`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('site-nav-drawer スマートフォンの幅でメニューのボタンを押した場合、ナビゲーションのドロワーが開くこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('schedule-calendar')).toBeVisible()
      await expect(page.getByTestId('site-nav')).toBeHidden()
      await intro(
        page,
        'スマートフォンの幅で、ヘッダーのメニューのボタンからナビゲーションのドロワーを開いて閉じる\n前提 幅 390px で予定のカレンダーを開いている。ナビゲーションは出ていない',
      )

      await step(
        page,
        'ヘッダーの左のメニューのボタンを押す',
        () => page.getByTestId('site-nav-toggle').click(),
        { position: 'bottom' },
      )
      await check(
        page,
        '左端からドロワーが開き、「予定」「照合」の見出しの下に画面の名前が並ぶ',
        async () => {
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await expect(page.getByTestId('site-nav-receipt')).toBeVisible()
        },
        { position: 'bottom' },
      )

      await step(
        page,
        'ドロワーの閉じるボタンを押す',
        () => page.getByTestId('site-nav-close').click(),
        { position: 'bottom' },
      )
      await check(
        page,
        'ドロワーが閉じる',
        () => expect(page.getByTestId('site-nav')).toBeHidden(),
        { position: 'bottom' },
      )
    })
  })
})
