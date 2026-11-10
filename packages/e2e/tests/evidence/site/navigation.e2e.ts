import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'

test.describe('画面の間のナビゲーション', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('site-nav-manager マネージャーが照合の画面を開いた場合、予定の見出しの下にカレンダー、取り込み、要確認、連携が並び、照合に印が付くこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute('aria-current', 'page')
      await intro(
        page,
        'PC の幅で、マネージャーが照合の画面を開き、ナビゲーションを見る\n前提 幅 1280px で照合の画面を開いている',
      )

      await check(
        page,
        'ナビゲーションの「予定」の見出しの下に、カレンダー、取り込み、要確認、連携が並ぶ。「照合」の見出しの下の照合に印が付く',
        async () => {
          for (const id of ['schedule', 'import', 'review', 'link'])
            await expect(page.getByTestId(`site-nav-${id}`)).toBeVisible()
          await expect(page.getByTestId('site-nav-receipt')).toHaveAttribute('aria-current', 'page')
        },
        { position: 'bottom' },
      )
    })

    test('site-nav-review ナビゲーションの「要確認」を押した場合、確認が必要な予定の画面に移り、要確認に印が付くこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('site-nav-review')).toBeVisible()
      await intro(page, 'ナビゲーションの「要確認」を押し、確認が必要な予定の画面に移る')

      await step(
        page,
        'ナビゲーションの「要確認」を押す',
        () => page.getByTestId('site-nav-review').click(),
        { position: 'bottom' },
      )
      await check(
        page,
        '確認が必要な予定の画面に移り、ナビゲーションの要確認に印が付く',
        async () => {
          await expect(page).toHaveURL(/\/schedule\/review$/)
          await expect(
            page.getByTestId('calendar-review-table').or(page.getByTestId('calendar-review-empty')),
          ).toBeVisible()
          await expect(page.getByTestId('site-nav-review')).toHaveAttribute('aria-current', 'page')
        },
        { position: 'bottom' },
      )
    })

    test('site-nav-link ナビゲーションの「連携」を押した場合、カレンダーの連携の画面に移ること', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('site-nav-link')).toBeVisible()
      await intro(page, 'ナビゲーションの「連携」を押し、カレンダーの連携の画面に移る')

      await step(
        page,
        'ナビゲーションの「連携」を押す',
        () => page.getByTestId('site-nav-link').click(),
        { position: 'bottom' },
      )
      await check(
        page,
        'カレンダーの連携の画面に移り、ナビゲーションの連携に印が付く',
        async () => {
          await expect(page).toHaveURL(/\/schedule\/link$/)
          await expect(page.getByTestId('site-nav-link')).toHaveAttribute('aria-current', 'page')
        },
        { position: 'bottom' },
      )
    })
  })

  test.describe(`${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('site-nav-leader 職員の管理の権限を持たない職員が開いた場合、予定の見出しの下にカレンダーだけが並ぶこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
      await intro(
        page,
        '職員の管理の権限を持たないチームリーダーが、照合の画面を開く\n前提 幅 1280px で照合の画面を開いている',
      )

      await check(
        page,
        'ナビゲーションの「予定」の見出しの下にはカレンダーだけが並び、取り込み、要確認、連携は出ない',
        async () => {
          await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
          for (const id of ['import', 'review', 'link'])
            await expect(page.getByTestId(`site-nav-${id}`)).toHaveCount(0)
        },
        { position: 'bottom' },
      )
    })
  })
})
