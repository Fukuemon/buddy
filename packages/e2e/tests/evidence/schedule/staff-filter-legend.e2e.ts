import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story。ログインした職員は架空の青木 一郎）'

const URL = storyUrl('画面-schedule-stafffiltersidebarcontainer--with-calendar')

const openFilter = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-filter-staff-staff-1')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('職員の絞り込みの色、名前の検索、自分だけ', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}予定のカレンダーを開いた場合、職員のチェックボックスがその職員の予定と同じ色で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-staff-filter-color',
            title: '職員の絞り込みのチェックボックスの色と、カレンダーの予定の色を見比べる',
            actor: ACTOR,
            variant,
          },
          openFilter(URL),
          async ({ page, step, check }) => {
            await openFilter(URL)(page)
            await step('職員の絞り込みを開いている（架空の職員 4 人）')
            const aoki = page.getByTestId('staff-filter-staff-staff-1')
            const ueda = page.getByTestId('staff-filter-staff-staff-3')
            // categorical-1 は blue-800、categorical-3 は cyan-900
            await expect(aoki).toHaveCSS('accent-color', 'rgb(0, 49, 216)')
            await expect(ueda).toHaveCSS('accent-color', 'rgb(0, 111, 131)')
            await expect(page.getByTestId('schedule-event-schedule-1')).toHaveCSS(
              'background-color',
              'rgb(0, 49, 216)',
            )
            await check(
              '青木 一郎のチェックボックスと日の表の予定が同じ青で、上田 三奈のチェックボックスは別の色で出る',
            )
          },
        )
      })

      test(`${prefix}名前の検索に語を入れて消した場合、一覧が絞られ、消すとチェックの状態のまま戻ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-staff-filter-search',
            title: '職員の絞り込みの名前の検索に語を入れ、消す',
            actor: ACTOR,
            variant,
          },
          openFilter(URL),
          async ({ page, step, check }) => {
            await openFilter(URL)(page)
            await step('職員の絞り込みを開いている（架空の職員 4 人。全員にチェックが入っている）')
            const search = page.getByTestId('staff-filter-search')
            await step('名前の検索に「上田」と入れる')
            await search.fill('上田')
            await expect(page.getByTestId('staff-filter-staff-staff-3')).toBeVisible()
            await expect(page.getByTestId('staff-filter-staff-staff-1')).toHaveCount(0)
            await check('上田 三奈だけが一覧に残り、A チームは出ない')

            await step('名前の検索の語を消す')
            await search.fill('')
            await expect(page.getByTestId('staff-filter-staff-staff-1')).toBeChecked()
            await expect(page.getByTestId('staff-filter-staff-staff-4')).toBeChecked()
            await check('全ての職員が、チェックが入ったまま一覧に戻る')
          },
        )
      })

      test(`${prefix}自分だけを押した場合、ログインした職員だけにチェックが入り、日の表に自分の列だけが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-staff-filter-only-me',
            title: '職員の絞り込みで「自分だけ」を押す',
            actor: ACTOR,
            variant,
          },
          openFilter(URL),
          async ({ page, step, check }) => {
            await openFilter(URL)(page)
            await step('職員の絞り込みを開いている（ログインした職員は架空の青木 一郎）')
            const onlyMe = page.getByTestId('staff-filter-only-me')
            await step('「自分だけ」を押す')
            await onlyMe.click()
            await expect(page.getByTestId('staff-filter-staff-staff-1')).toBeChecked()
            await expect(page.getByTestId('staff-filter-staff-staff-2')).not.toBeChecked()
            await expect(page.getByTestId('day-grid-staff-staff-1')).toBeVisible()
            await expect(page.getByTestId('day-grid-staff-staff-2')).toHaveCount(0)
            await expect(onlyMe).toBeDisabled()
            await check(
              '青木 一郎だけにチェックが入り、日の表に青木 一郎の列だけが出て、「自分だけ」は押せなくなる',
            )
          },
        )
      })
    }
  })
})
