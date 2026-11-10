import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { otherPositionOption } from '../../selectors/staffPosition'

const DEFAULT_URL = storyUrl('画面-staff-staffdetailcontainer--default')
const NO_ASSIGNMENTS_URL = storyUrl('画面-staff-staffdetailcontainer--no-assignments')

const openStory = async (page: Page, url: string) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-detail-name')).toBeVisible()
}

// 確定のボタンの色は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版で通る文言と押せることだけを見る
test.describe('職員の詳細', () => {
  test.describe('データを失う操作のボタン（ログインなし、Storybook の story）', () => {
    test(
      'staff-retire-submit 職員の退職の確認のダイアログを開いた場合、確定のボタンが赤い塗りであること',
      { tag: '@compare' },
      async ({ page }) => {
        await openStory(page, NO_ASSIGNMENTS_URL)
        await intro(
          page,
          '職員の退職の確認のダイアログで、確定のボタンの見た目を見る\n前提 残る予定と担当の無い職員の詳細（Storybook の StaffDetailContainer の NoAssignments）を開いている',
        )

        await step(page, '「ほかの操作」のメニューから「退職にする」を選ぶ', async () => {
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-retire').click()
        })
        const submit = page.getByTestId('staff-retire-submit')
        await check(page, '確定の「退職にする」が、赤い塗りのボタンである', async () => {
          await expect(submit).toHaveText('退職にする')
          await expect(submit).toBeEnabled()
        })
      },
    )

    test(
      'staff-position-submit 職員の役職を変えるダイアログで違う役職を選んだ場合、確定のボタンが赤い塗りであること',
      { tag: '@compare' },
      async ({ page }) => {
        await openStory(page, DEFAULT_URL)
        await intro(
          page,
          '職員の役職を変えるダイアログで、確定のボタンの見た目を見る\n前提 職員の詳細（Storybook の StaffDetailContainer の Default）を開いている',
        )

        await step(page, '役職の右の「役職を変える」を押し、今と違う役職を選ぶ', async () => {
          await page.getByTestId('staff-detail-position-change').click()
          await otherPositionOption(page.getByTestId('staff-position-dialog')).check()
        })
        const submit = page.getByTestId('staff-position-submit')
        await check(
          page,
          '確定の「役職を変える」が、赤い塗りのボタンである。権限が置き換わる注意の文が出る',
          async () => {
            await expect(submit).toHaveText('役職を変える')
            await expect(submit).toBeEnabled()
            await expect(page.getByTestId('staff-position-note')).toBeVisible()
          },
        )
      },
    )
  })
})
