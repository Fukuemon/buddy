import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

const signInAsManager = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

test.describe('画面の間のナビゲーション', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}マネージャーが照合の画面を開いた場合、予定の見出しの下にカレンダー、取り込み、要確認、連携が並び、照合に印が付くこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-manager',
          title: 'PC の幅で、マネージャーが照合の画面を開き、ナビゲーションを見る',
          actor: MANAGER,
          variant,
        },
        signInAsManager,
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute('aria-current', 'page')
          await step('幅 1280px で照合の画面を開いている')
          for (const id of ['schedule', 'import', 'review', 'link'])
            await expect(page.getByTestId(`site-nav-${id}`)).toBeVisible()
          await check(
            'ナビゲーションの「予定」の見出しの下に、カレンダー、取り込み、要確認、連携が並ぶ。「照合」の見出しの下の照合に印が付く',
          )
        },
      )
    })

    test(`${prefix}ナビゲーションの「要確認」を押した場合、確認が必要な予定の画面に移り、要確認に印が付くこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-review',
          title: 'ナビゲーションの「要確認」を押し、確認が必要な予定の画面に移る',
          actor: MANAGER,
          variant,
        },
        signInAsManager,
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await expect(page.getByTestId('site-nav-review')).toBeVisible()
          await step('ナビゲーションの「要確認」を押す')
          await page.getByTestId('site-nav-review').click()
          await expect(page).toHaveURL(/\/schedule\/review$/)
          await expect(
            page.getByTestId('calendar-review-table').or(page.getByTestId('calendar-review-empty')),
          ).toBeVisible()
          await expect(page.getByTestId('site-nav-review')).toHaveAttribute('aria-current', 'page')
          await check('確認が必要な予定の画面に移り、ナビゲーションの要確認に印が付く')
        },
      )
    })

    test(`${prefix}ナビゲーションの「連携」を押した場合、カレンダーの連携の画面に移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-link',
          title: 'ナビゲーションの「連携」を押し、カレンダーの連携の画面に移る',
          actor: MANAGER,
          variant,
        },
        signInAsManager,
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await expect(page.getByTestId('site-nav-link')).toBeVisible()
          await step('ナビゲーションの「連携」を押す')
          await page.getByTestId('site-nav-link').click()
          await expect(page).toHaveURL(/\/schedule\/link$/)
          await expect(page.getByTestId('site-nav-link')).toHaveAttribute('aria-current', 'page')
          await check('カレンダーの連携の画面に移り、ナビゲーションの連携に印が付く')
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が開いた場合、予定の見出しの下にカレンダーだけが並ぶこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'site-nav-leader',
          title: '職員の管理の権限を持たないチームリーダーが、照合の画面を開く',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
          await step('幅 1280px で照合の画面を開いている')
          await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
          for (const id of ['import', 'review', 'link'])
            await expect(page.getByTestId(`site-nav-${id}`)).toHaveCount(0)
          await check(
            'ナビゲーションの「予定」の見出しの下にはカレンダーだけが並び、取り込み、要確認、連携は出ない',
          )
        },
      )
    })
  }
})
