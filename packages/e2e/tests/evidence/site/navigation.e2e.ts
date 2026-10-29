import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('画面の間のナビゲーション', () => {
  test.describe('機能のタブと予定の中のタブ', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}PC の幅でマネージャーが予定の画面を開いた場合、ヘッダーに機能のタブが、中身の上端に予定の中のタブが並び、予定とカレンダーに今の画面の印が付くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-tabs-manager',
            title: 'PC の幅で、マネージャーが予定の画面を開き、機能のタブと予定の中のタブを見る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            const nav = page.getByTestId('site-nav')
            const subnav = page.getByTestId('site-subnav')
            await expect(nav).toBeVisible()
            await step('幅 1280px で予定の画面を開いている')
            await expect(nav).toContainText(['予定', '照合'].join(''))
            await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await expect(subnav).toContainText(['カレンダー', '取り込み', '要確認'].join(''))
            await expect(page.getByTestId('site-nav-calendar')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await check(
              'ヘッダーの buddy の右に予定と照合のタブが並び、予定に下線が付く。中身の上端にカレンダー、取り込み、要確認のタブが並び、カレンダーに下線が付く',
            )
          },
        )
      })

      test(`${prefix}機能のタブの照合を押した場合、照合の画面に移り、照合に今の画面の印が付くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-tabs-move',
            title: '機能のタブの「照合」を押し、照合の画面に移る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await step('機能のタブの「照合」を押す')
            await page.getByTestId('site-nav-receipt').click()
            await expect(page).toHaveURL(/\/receipt$/)
            await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await expect(page.getByTestId('site-nav-schedule')).not.toHaveAttribute('aria-current')
            await expect(page.getByTestId('site-subnav')).toHaveCount(0)
            await check('照合の画面に移り、照合のタブに下線が付く。予定の中のタブは出ない')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持たない職員が開いた場合、予定の中のタブが出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-tabs-leader',
            title: '職員の管理の権限を持たないチームリーダーが、予定の画面を開く',
            actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LEADER.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
            await step('幅 1280px で予定の画面を開いている')
            await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
            await expect(page.getByTestId('site-nav-receipt')).toBeVisible()
            await expect(page.getByTestId('site-subnav')).toHaveCount(0)
            await check('ヘッダーに予定と照合のタブが並び、予定の中のタブは出ない')
          },
        )
      })

      test(`${prefix}スマートフォンの幅で機能のタブの照合を押した場合、照合の画面に移り、メニューのボタンが無いこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-tabs-phone',
            title: 'スマートフォンの幅で、機能のタブの「照合」を押す',
            actor: MANAGER,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(page.getByTestId('site-nav-receipt')).toBeVisible()
            await expect(page.getByTestId('site-sidebar-open')).toBeVisible()
            await check(
              '幅 390px の予定のカレンダーでは、ヘッダーの左にメニューのボタンがあり、buddy の右に機能のタブがある',
            )

            await step('機能のタブの「照合」を押す')
            await page.getByTestId('site-nav-receipt').click()
            await expect(page).toHaveURL(/\/receipt$/)
            await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await expect(page.getByTestId('site-sidebar-open')).toHaveCount(0)
            await check('照合の画面に移り、照合のタブに下線が付く。メニューのボタンは無い')
          },
        )
      })
    }
  })
})
