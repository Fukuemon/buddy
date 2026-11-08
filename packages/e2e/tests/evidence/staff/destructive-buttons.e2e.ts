import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { otherPositionOption } from '../../selectors/staffPosition'

const ACTOR = 'ログインなし（Storybook の story）'
const DEFAULT_URL = storyUrl('画面-staff-staffdetailcontainer--default')
const NO_ASSIGNMENTS_URL = storyUrl('画面-staff-staffdetailcontainer--no-assignments')

const openStory = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-detail-name')).toBeVisible()
}

test.describe('職員の詳細', () => {
  test.describe('データを失う操作のボタン', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}職員の退職の確認のダイアログを開いた場合、確定のボタンが赤い塗りであること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-retire-submit',
            title: '職員の退職の確認のダイアログで、確定のボタンの見た目を見る',
            actor: ACTOR,
            variant,
          },
          openStory(NO_ASSIGNMENTS_URL),
          async ({ page, step, check }) => {
            await openStory(NO_ASSIGNMENTS_URL)(page)
            await step(
              '残る予定と担当の無い職員の詳細（Storybook の StaffDetailContainer の NoAssignments）を開いている',
            )
            await step('「ほかの操作」のメニューから「退職にする」を選ぶ')
            await page.getByTestId('staff-detail-menu').click()
            await page.getByTestId('staff-detail-retire').click()
            const submit = page.getByTestId('staff-retire-submit')
            await expect(submit).toHaveText('退職にする')
            await expect(submit).toBeEnabled()
            if (isBefore) {
              await expect(submit).toHaveClass(/text-danger/)
              await check('改修前: 確定の「退職にする」が、白い面に赤い文字のボタンである')
            } else {
              await expect(submit).toHaveClass(/bg-danger/)
              await check('確定の「退職にする」が、赤い塗りのボタンである')
            }
          },
        )
      })

      test(`${prefix}職員の役職を変えるダイアログで違う役職を選んだ場合、確定のボタンが赤い塗りであること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-position-submit',
            title: '職員の役職を変えるダイアログで、確定のボタンの見た目を見る',
            actor: ACTOR,
            variant,
          },
          openStory(DEFAULT_URL),
          async ({ page, step, check }) => {
            await openStory(DEFAULT_URL)(page)
            await step('職員の詳細（Storybook の StaffDetailContainer の Default）を開いている')
            await step('役職の右の「役職を変える」を押し、今と違う役職を選ぶ')
            await page.getByTestId('staff-detail-position-change').click()
            await otherPositionOption(page.getByTestId('staff-position-dialog')).check()
            const submit = page.getByTestId('staff-position-submit')
            await expect(submit).toHaveText('役職を変える')
            await expect(submit).toBeEnabled()
            await expect(page.getByTestId('staff-position-note')).toBeVisible()
            if (isBefore) {
              await expect(submit).toHaveClass(/text-danger/)
              await check(
                '改修前: 確定の「役職を変える」が、白い面に赤い文字のボタンである。権限が置き換わる注意の文が出る',
              )
            } else {
              await expect(submit).toHaveClass(/bg-danger/)
              await check(
                '確定の「役職を変える」が、赤い塗りのボタンである。権限が置き換わる注意の文が出る',
              )
            }
          },
        )
      })
    }
  })
})
