import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

const STORY_URL = storyUrl('画面-schedule-stafffiltersidebarcontainer--all-staff')

/** SiteLayout の左のサイドバーの幅（w-72）の px。 */
const SIDEBAR_WIDTH_PX = 288

test.describe('職員の絞り込みの story', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}Storybook で職員の絞り込みのサイドバーの story を開いた場合、予定の画面の左のサイドバーと同じ幅で描かれること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-filter-story-width',
          title: '職員の絞り込みの story が、予定の画面の左のサイドバーと同じ 288px の幅で描かれる',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto(STORY_URL)
        },
        async ({ page, step, check }) => {
          await step('職員の絞り込みのサイドバーの story を開く')
          await page.goto(STORY_URL)
          const sidebar = page.getByTestId('staff-filter-sidebar')
          await expect(sidebar).toBeVisible()
          await expect
            .poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
            .toBe(SIDEBAR_WIDTH_PX)
          await check(`絞り込みが、左のサイドバーと同じ ${SIDEBAR_WIDTH_PX}px の幅で描かれる`)
        },
      )
    })
  }
})
