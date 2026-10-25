import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('画面の間のナビゲーション', () => {
  test.describe('左端の縦のナビゲーション', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}PC の幅でマネージャーが予定の画面を開いた場合、左端に 4 つの項目が並び、予定に今の画面の印が付くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-rail-manager',
            title: 'PC の幅で、マネージャーが予定の画面を開き、左端のナビゲーションを見る',
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
            await expect(nav).toBeVisible()
            await step('幅 1280px で予定の画面を開いている')
            await expect(nav).toContainText(['予定', '照合', '取り込み', '要確認'].join(''))
            await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await expect(page.getByTestId('site-nav-open')).toHaveCount(0)
            await check(
              '左端に、予定、照合、取り込み、要確認がアイコンと名前で並び、予定に面の色の印が付く。ヘッダーには buddy とログインした職員だけがある',
            )
          },
        )
      })

      test(`${prefix}左端のナビゲーションの照合を押した場合、照合の画面に移り、照合に今の画面の印が付くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-rail-move',
            title: '左端のナビゲーションの「照合」を押し、照合の画面に移る',
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
            await step('左端のナビゲーションの「照合」を押す')
            await page.getByTestId('site-nav-receipt').click()
            await expect(page).toHaveURL(/\/receipt$/)
            await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await expect(page.getByTestId('site-nav-schedule')).not.toHaveAttribute('aria-current')
            await check('照合の画面に移り、左端の照合に面の色の印が付く')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持たない職員が開いた場合、予定と照合だけが並ぶこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-rail-leader',
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
            await expect(page.getByTestId('site-nav-import')).toHaveCount(0)
            await expect(page.getByTestId('site-nav-review')).toHaveCount(0)
            await check('左端に予定と照合だけが並び、取り込みと要確認は出ない')
          },
        )
      })
    }
  })

  test.describe('メニューのドロワー', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}スマートフォンの幅でメニューのボタンを押した場合、ドロワーにナビゲーションが出て、項目を押すとその画面に移ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-nav-drawer',
            title: 'スマートフォンの幅で、メニューのボタンからドロワーを開き、「照合」を押す',
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
            const drawer = page.getByTestId('site-nav-drawer')
            await expect(page.getByTestId('site-nav-open')).toBeVisible()
            await expect(drawer).toBeHidden()
            await check(
              '幅 390px では、左端のナビゲーションが無く、ヘッダーの左にメニューのボタンがある',
            )

            await step('ヘッダーの左のメニューのボタンを押す')
            await page.getByTestId('site-nav-open').click()
            await expect(drawer).toBeVisible()
            await expect(drawer.getByTestId('site-nav-schedule')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await check(
              '左端からドロワーが開き、予定、照合、取り込み、要確認が並ぶ。予定に印が付く',
            )

            await step('ドロワーの「照合」を押す')
            await drawer.getByTestId('site-nav-receipt').click()
            await expect(page).toHaveURL(/\/receipt$/)
            await expect(page.getByTestId('site-nav-open')).toBeVisible()
            await step('照合の画面に移ったので、もう一度メニューのボタンを押す')
            await page.getByTestId('site-nav-open').click()
            await expect(
              page.getByTestId('site-nav-drawer').getByTestId('site-nav-receipt'),
            ).toHaveAttribute('aria-current', 'page')
            await check('照合の画面に移る。メニューを開き直すと、照合に今の画面の印が付いている')
          },
        )
      })
    }
  })
})
