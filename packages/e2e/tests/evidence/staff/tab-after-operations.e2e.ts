import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const story = (name: string) => storyUrl(`画面-staff-staffdetailcontainer--${name}`)

const openStory = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-detail-name')).toBeVisible()
}

/** 操作の後に出ているタブを確認する。改修前は権限のタブのまま、改修後はプロフィールのタブを期待する。 */
const expectTabAfter = async (page: Page, isBefore: boolean) => {
  const shown = isBefore ? 'policies' : 'profile'
  await expect(page.getByTestId(`staff-detail-tab-${shown}`)).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByTestId(`staff-detail-${shown}`)).toBeVisible()
}

test.describe('職員の詳細の操作の後のタブ', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''
    const isBefore = variant.name === 'before'
    const result = (status: string) =>
      isBefore
        ? `${status}が、権限のタブのままで、在籍の状態を確認できない`
        : `プロフィールのタブに替わり、${status}を確認できる`

    test(`${prefix}権限のタブを開いたまま有効な職員を休職にした場合、休職の職員のプロフィールのタブを出すこと`, async ({
      browser,
    }) => {
      const url = story('no-assignments')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-tab-after-leave',
          title: '権限のタブから休職にした後に、休職の職員のプロフィールのタブを出す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '有効な石川 二葉の職員の詳細（Storybook の NoAssignments）を開いている（架空のデータ）',
          )
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
          await step('タブの「権限」を押し、「…」から「休職にする」を選ぶ')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-leave').click()
          const dialog = page.getByTestId('staff-leave-dialog')
          await expect(dialog.getByTestId('staff-leave-assignments')).toBeVisible()
          await step('戻る予定の日に 2027-04-01 を入れ、休職にする')
          await dialog.getByTestId('staff-leave-return-date').fill('2027-04-01')
          await dialog.getByTestId('staff-leave-submit').click()
          await expect(page.getByTestId('staff-detail-status')).toContainText('休職')
          await expectTabAfter(page, isBefore)
          await check(result('休職になった後'))
        },
      )
    })

    test(`${prefix}権限のタブを開いたまま休職の職員を復職にした場合、有効な職員のプロフィールのタブを出すこと`, async ({
      browser,
    }) => {
      const url = story('on-leave')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-tab-after-reinstate',
          title: '権限のタブから復職にした後に、有効な職員のプロフィールのタブを出す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await expect(page.getByTestId('staff-detail-status')).toContainText('休職')
          await step('休職の江藤 四郎の職員の詳細（Storybook の OnLeave）を開いている（架空のデータ）')
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
          await step('タブの「権限」を押し、「…」から「復職にする」を選ぶ')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page.getByTestId('staff-detail-status')).toBeHidden()
          await expectTabAfter(page, isBefore)
          await check(result('復職した後'))
        },
      )
    })

    test(`${prefix}権限のタブを開いたまま職員を退職にした場合、退職した職員のプロフィールのタブを出すこと`, async ({
      browser,
    }) => {
      const url = story('no-assignments')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-tab-after-retire',
          title: '権限のタブから退職にした後に、退職した職員のプロフィールのタブを出す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step(
            '有効な石川 二葉の職員の詳細（Storybook の NoAssignments）を開いている（架空のデータ）',
          )
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
          await step('タブの「権限」を押し、「…」から「退職にする」を選ぶ')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-retire').click()
          const dialog = page.getByTestId('staff-retire-dialog')
          await expect(dialog.getByTestId('staff-retire-submit')).toBeEnabled()
          await step('ダイアログの「退職にする」を押す')
          await dialog.getByTestId('staff-retire-submit').click()
          await expect(page.getByTestId('staff-detail-status')).toContainText('退職')
          await expectTabAfter(page, isBefore)
          await check(result('退職になった後'))
        },
      )
    })

    test(`${prefix}権限のタブを開いたまま見出しの編集でプロフィールを保存した場合、プロフィールのタブを出すこと`, async ({
      browser,
    }) => {
      const url = story('default')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-tab-after-profile-save',
          title: '権限のタブからプロフィールを保存した後に、プロフィールのタブを出す',
          actor: ACTOR,
          variant,
        },
        openStory(url),
        async ({ page, step, check }) => {
          await openStory(url)(page)
          await step('有効な石川 二葉の職員の詳細（Storybook の Default）を開いている（架空のデータ）')
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
          await step('タブの「権限」を押し、見出しの「編集」を押す')
          await page.getByTestId('staff-detail-edit').click()
          const dialog = page.getByTestId('staff-detail-edit-dialog')
          await expect(dialog.getByTestId('staff-detail-department-input')).toBeVisible()
          await step('チームを B チームに替えて、保存する')
          await dialog.getByTestId('staff-detail-team-input').selectOption('B チーム')
          await dialog.getByTestId('staff-detail-save').click()
          await expect(dialog).toBeHidden()
          await expectTabAfter(page, isBefore)
          await check(
            isBefore
              ? '保存した後も、権限のタブのままで、変えたチームを確認できない'
              : 'プロフィールのタブに替わり、変えたチーム（B チーム）を確認できる',
          )
        },
      )
    })
  }
})
