import { expect, test, type Page } from '@playwright/test'

import { check, intro } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const STORY_URL = storyUrl('画面-schedule-stafffiltersidebarcontainer--all-staff')

/** SiteLayout の sidebar を描く aside の幅（w-72）の px。 */
const SIDEBAR_WIDTH_PX = 288

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

test.describe('予定のカレンダー', () => {
  test.describe('職員の絞り込みの story の幅（ログインなし、Storybook の story）', () => {
    test('staff-filter-story-width Storybook で職員の絞り込みのサイドバーの story を開いた場合、予定の画面の左のサイドバーと同じ幅で描かれること', async ({
      page,
    }) => {
      await page.goto(STORY_URL)
      await shiftStory(page)
      const sidebar = page.getByTestId('staff-filter-sidebar')
      await expect(sidebar).toBeVisible()
      await intro(
        page,
        '職員の絞り込みの story が、予定の画面の左のサイドバーと同じ 288px の幅で描かれる\n前提 職員の絞り込みのサイドバーの story を開き、字幕に隠れないように中身を下へずらした（撮影のため）',
      )

      await check(
        page,
        `絞り込みが、左のサイドバーと同じ ${SIDEBAR_WIDTH_PX}px の幅で描かれる`,
        () =>
          expect
            .poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
            .toBe(SIDEBAR_WIDTH_PX),
      )
    })
  })
})
