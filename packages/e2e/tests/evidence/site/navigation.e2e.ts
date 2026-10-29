import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('画面の間のナビゲーション', () => {
  test.describe('ヘッダーのアプリ、取り込み、要確認のボタン', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}PC の幅でマネージャーが予定の画面を開いた場合、ヘッダーに「予定」の名前、取り込みと要確認のボタンが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-header-manager',
            title: 'PC の幅で、マネージャーが予定の画面を開き、ヘッダーを見る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(page.getByTestId('site-title')).toHaveText('予定')
            await step('幅 1280px で予定の画面を開いている')
            await expect(page.getByTestId('site-nav-import')).toBeVisible()
            await expect(page.getByTestId('site-nav-review')).toBeVisible()
            await expect(page.getByTestId('site-apps-open')).toBeVisible()
            await check(
              'ヘッダーの buddy の右に「予定」の名前が出る。右に取り込み、要確認、アプリ、アカウントのボタンが並ぶ',
            )
          },
        )
      })

      test(`${prefix}アプリのボタンを押して「照合」を押した場合、照合の画面に移り、ヘッダーの名前が「照合」になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-apps-move',
            title: 'アプリのメニューの「照合」を押し、照合の画面に移る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(page.getByTestId('site-title')).toHaveText('予定')
            await step('アプリのボタンを押す')
            await page.getByTestId('site-apps-open').click()
            await expect(page.getByTestId('site-nav')).toBeVisible()
            await expect(page.getByTestId('site-nav-schedule')).toHaveAttribute(
              'aria-current',
              'page',
            )
            await check('ボタンの下に「予定」「照合」のメニューが開き、「予定」に印が付く')

            await step('メニューの「照合」を押す')
            await page.getByTestId('site-nav-receipt').click()
            await expect(page).toHaveURL(/\/receipt$/)
            await expect(page.getByTestId('site-title')).toHaveText('照合')
            await check('照合の画面に移り、ヘッダーの名前が「照合」になる')
          },
        )
      })

      test(`${prefix}要確認のボタンを押した場合、確認が必要な予定の画面に移ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-header-review',
            title: 'ヘッダーの要確認のボタンを押し、確認が必要な予定の画面に移る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(page.getByTestId('site-nav-review')).toBeVisible()
            await step('要確認のボタンを押す')
            await page.getByTestId('site-nav-review').click()
            await expect(page).toHaveURL(/\/schedule\/review$/)
            await expect(
              page
                .getByTestId('calendar-review-table')
                .or(page.getByTestId('calendar-review-empty')),
            ).toBeVisible()
            await check('確認が必要な予定の画面に移る')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持たない職員が開いた場合、取り込みと要確認のボタンが出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-header-leader',
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
            await expect(page.getByTestId('site-title')).toHaveText('予定')
            await expect(page.getByTestId('site-apps-open')).toBeVisible()
            await expect(page.getByTestId('site-nav-import')).toHaveCount(0)
            await expect(page.getByTestId('site-nav-review')).toHaveCount(0)
            await check(
              'ヘッダーにアプリとアカウントのボタンだけが並び、取り込みと要確認のボタンは出ない',
            )
          },
        )
      })
    }
  })
})
