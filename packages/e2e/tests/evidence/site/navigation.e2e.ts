import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('画面の間のナビゲーション', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}PC の幅でマネージャーが予定の画面を開いた場合、ヘッダーに機能のタブが、その下に予定の中のタブが並び、今の画面に印が付くこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-tabs-manager',
          title: 'PC の幅で、マネージャーが予定の画面を開き、ヘッダーのタブと予定の中のタブを見る',
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
          await step('幅 1280px で予定のカレンダーを開いている')
          await expect(nav).toContainText(['予定', '照合'].join(''))
          await expect(subnav).toContainText(['カレンダー', '取り込み', '要確認'].join(''))
          await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
            'aria-current',
            'page',
          )
          await expect(page.getByTestId('site-nav-calendar')).toHaveAttribute(
            'aria-current',
            'page',
          )
          await check(
            'ヘッダーに予定と照合のタブが、カレンダーの上にカレンダー、取り込み、要確認のタブが並ぶ。予定とカレンダーに下線の印が付く',
          )

          await step('予定の中のタブの「要確認」を押す')
          await page.getByTestId('site-nav-review').click()
          await expect(page).toHaveURL(/\/schedule\/review$/)
          await expect(page.getByTestId('site-nav-review')).toHaveAttribute('aria-current', 'page')
          await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
            'aria-current',
            'page',
          )
          await check('確認が必要な予定の画面に移り、要確認と予定に印が付く。左の欄は出ない')
        },
      )
    })

    test(`${prefix}ヘッダーの照合のタブを押した場合、照合の画面に移り、照合に印が付いて予定の中のタブが消えること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-tabs-move',
          title: 'ヘッダーの「照合」のタブを押し、照合の画面に移る',
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
          await step('ヘッダーの「照合」のタブを押す')
          await page.getByTestId('site-nav-receipt').click()
          await expect(page).toHaveURL(/\/receipt$/)
          await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute('aria-current', 'page')
          await expect(page.getByTestId('site-subnav')).toHaveCount(0)
          await expect(page.getByTestId('site-sidebar-open')).toHaveCount(0)
          await check(
            '照合の画面に移り、照合に印が付く。予定の中のタブ、左の欄、メニューのボタンは出ない',
          )
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

    test(`${prefix}スマートフォンの幅で開いた場合、ヘッダーに機能のタブが、その下に予定の中のタブが出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-tabs-phone',
          title: 'スマートフォンの幅で、マネージャーが予定の画面を開き、タブを見る',
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
          await expect(page.getByTestId('site-nav')).toBeVisible()
          await step('幅 390px で予定のカレンダーを開いている')
          await expect(page.getByTestId('site-subnav')).toBeVisible()
          await expect(page.getByTestId('site-sidebar-open')).toBeVisible()
          await check(
            'ヘッダーに、メニューのボタン、buddy、予定と照合のタブ、アカウントのボタンが並び、その下に予定の中のタブが出る',
          )
        },
      )
    })
  }
})
