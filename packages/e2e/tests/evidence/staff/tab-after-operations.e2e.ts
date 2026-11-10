import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const story = (name: string) => storyUrl(`画面-staff-staffdetailcontainer--${name}`)

const openStory = async (page: Page, url: string) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-detail-name')).toBeVisible()
}

/** 権限のタブを押し、権限の一覧が出るまで待つ。 */
const openPoliciesTab = async (page: Page) => {
  await page.getByTestId('staff-detail-tab-policies').click()
  await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
}

// 操作の後のタブは、改修前は権限のタブのまま、改修後はプロフィールのタブになる。確認する関数は両方の版で通る在籍の状態だけを見て、タブは判定のスクリーンショットを並べて比べる
test.describe('職員の詳細の操作の後のタブ', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    test(
      'staff-detail-tab-after-leave 権限のタブを開いたまま有効な職員を休職にした場合、休職の職員のプロフィールのタブを出すこと',
      { tag: '@compare' },
      async ({ page }) => {
        await openStory(page, story('no-assignments'))
        await intro(page, '権限のタブから休職にした後に、休職の職員のプロフィールのタブを出す')

        await check(
          page,
          '前提 有効な石川 二葉の職員の詳細（Storybook の NoAssignments）を開いている（架空のデータ）',
          () => expect(page.getByTestId('staff-detail-name')).toBeVisible(),
        )
        await step(page, 'タブの「権限」を押し、「…」から「休職にする」を選ぶ', async () => {
          await openPoliciesTab(page)
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-leave').click()
          await expect(
            page.getByTestId('staff-leave-dialog').getByTestId('staff-leave-assignments'),
          ).toBeVisible()
        })
        await step(page, '戻る予定の日に 2027-04-01 を入れ、休職にする', async () => {
          const dialog = page.getByTestId('staff-leave-dialog')
          await dialog.getByTestId('staff-leave-return-date').fill('2027-04-01')
          await dialog.getByTestId('staff-leave-submit').click()
        })
        await check(page, 'プロフィールのタブに替わり、休職になった後を確認できる', async () => {
          await expect(page.getByTestId('staff-detail-status')).toContainText('休職')
        })
      },
    )

    test(
      'staff-detail-tab-after-reinstate 権限のタブを開いたまま休職の職員を復職にした場合、有効な職員のプロフィールのタブを出すこと',
      { tag: '@compare' },
      async ({ page }) => {
        await openStory(page, story('on-leave'))
        await expect(page.getByTestId('staff-detail-status')).toContainText('休職')
        await intro(page, '権限のタブから復職にした後に、有効な職員のプロフィールのタブを出す')

        await check(
          page,
          '前提 休職の江藤 四郎の職員の詳細（Storybook の OnLeave）を開いている（架空のデータ）',
          () => expect(page.getByTestId('staff-detail-name')).toBeVisible(),
        )
        await step(page, 'タブの「権限」を押し、「…」から「復職にする」を選ぶ', async () => {
          await openPoliciesTab(page)
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-reinstate').click()
        })
        await check(page, 'プロフィールのタブに替わり、復職した後を確認できる', async () => {
          await expect(page.getByTestId('staff-detail-status')).toBeHidden()
        })
      },
    )

    test(
      'staff-detail-tab-after-retire 権限のタブを開いたまま職員を退職にした場合、退職した職員のプロフィールのタブを出すこと',
      { tag: '@compare' },
      async ({ page }) => {
        await openStory(page, story('no-assignments'))
        await intro(page, '権限のタブから退職にした後に、退職した職員のプロフィールのタブを出す')

        await check(
          page,
          '前提 有効な石川 二葉の職員の詳細（Storybook の NoAssignments）を開いている（架空のデータ）',
          () => expect(page.getByTestId('staff-detail-name')).toBeVisible(),
        )
        const dialog = page.getByTestId('staff-retire-dialog')
        await step(page, 'タブの「権限」を押し、「…」から「退職にする」を選ぶ', async () => {
          await openPoliciesTab(page)
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-retire').click()
          await expect(dialog.getByTestId('staff-retire-submit')).toBeEnabled()
        })
        await step(page, 'ダイアログの「退職にする」を押す', () =>
          dialog.getByTestId('staff-retire-submit').click(),
        )
        await check(page, 'プロフィールのタブに替わり、退職になった後を確認できる', async () => {
          await expect(page.getByTestId('staff-detail-status')).toContainText('退職')
        })
      },
    )

    test(
      'staff-detail-tab-after-profile-save 権限のタブを開いたまま見出しの編集でプロフィールを保存した場合、プロフィールのタブを出すこと',
      { tag: '@compare' },
      async ({ page }) => {
        await openStory(page, story('default'))
        await intro(page, '権限のタブからプロフィールを保存した後に、プロフィールのタブを出す')

        await check(
          page,
          '前提 有効な石川 二葉の職員の詳細（Storybook の Default）を開いている（架空のデータ）',
          () => expect(page.getByTestId('staff-detail-name')).toBeVisible(),
        )
        const dialog = page.getByTestId('staff-detail-edit-dialog')
        await step(page, 'タブの「権限」を押し、見出しの「編集」を押す', async () => {
          await openPoliciesTab(page)
          await page.getByTestId('staff-detail-edit').click()
          await expect(dialog.getByTestId('staff-detail-department-input')).toBeVisible()
        })
        await step(page, 'チームを B チームに替えて、保存する', async () => {
          await dialog.getByTestId('staff-detail-team-input').selectOption('B チーム')
          await dialog.getByTestId('staff-detail-save').click()
        })
        await check(
          page,
          'プロフィールのタブに替わり、変えたチーム（B チーム）を確認できる',
          async () => {
            await expect(dialog).toBeHidden()
          },
        )
      },
    )
  })
})
