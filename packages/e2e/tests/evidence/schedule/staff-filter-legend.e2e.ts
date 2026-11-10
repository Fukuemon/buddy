import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const URL = storyUrl('画面-schedule-stafffiltersidebarcontainer--with-calendar')

const openFilter = async (page: Page) => {
  await page.goto(URL)
  await expect(page.getByTestId('staff-filter-staff-staff-1')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('職員の絞り込みの色、名前の検索、自分だけ（ログインなし、Storybook の story。ログインした職員は架空の青木 一郎）', () => {
    test('schedule-staff-filter-color 予定のカレンダーを開いた場合、職員のチェックボックスがその職員の予定と同じ色で出ること', async ({
      page,
    }) => {
      await openFilter(page)
      await intro(
        page,
        '職員の絞り込みのチェックボックスの色と、カレンダーの予定の色を見比べる\n前提 職員の絞り込みを開いている（架空の職員 4 人）',
      )
      const aoki = page.getByTestId('staff-filter-staff-staff-1')
      const ueda = page.getByTestId('staff-filter-staff-staff-3')
      await check(
        page,
        '青木 一郎のチェックボックスと日の表の予定が同じ青で、上田 三奈のチェックボックスは別の色で出る',
        async () => {
          // categorical-1 は blue-800、categorical-3 は cyan-900
          await expect(aoki).toHaveCSS('accent-color', 'rgb(0, 49, 216)')
          await expect(ueda).toHaveCSS('accent-color', 'rgb(0, 111, 131)')
          await expect(page.getByTestId('schedule-event-schedule-1')).toHaveCSS(
            'background-color',
            'rgb(0, 49, 216)',
          )
        },
      )
    })

    test('schedule-staff-filter-search 名前の検索に語を入れて消した場合、一覧が絞られ、消すとチェックの状態のまま戻ること', async ({
      page,
    }) => {
      await openFilter(page)
      await intro(
        page,
        '職員の絞り込みの名前の検索に語を入れ、消す\n前提 職員の絞り込みを開いている（架空の職員 4 人。全員にチェックが入っている）',
      )
      const search = page.getByTestId('staff-filter-search')
      await step(page, '名前の検索に「上田」と入れる', () => search.fill('上田'))
      await check(page, '上田 三奈だけが一覧に残り、A チームは出ない', async () => {
        await expect(page.getByTestId('staff-filter-staff-staff-3')).toBeVisible()
        await expect(page.getByTestId('staff-filter-staff-staff-1')).toHaveCount(0)
      })

      await step(page, '名前の検索の語を消す', () => search.fill(''))
      await check(page, '全ての職員が、チェックが入ったまま一覧に戻る', async () => {
        await expect(page.getByTestId('staff-filter-staff-staff-1')).toBeChecked()
        await expect(page.getByTestId('staff-filter-staff-staff-4')).toBeChecked()
      })
    })

    test('schedule-staff-filter-only-me 自分だけを押した場合、ログインした職員だけにチェックが入り、日の表に自分の列だけが出ること', async ({
      page,
    }) => {
      await openFilter(page)
      await intro(
        page,
        '職員の絞り込みで「自分だけ」を押す\n前提 職員の絞り込みを開いている（ログインした職員は架空の青木 一郎）',
      )
      const onlyMe = page.getByTestId('staff-filter-only-me')
      await step(page, '「自分だけ」を押す', () => onlyMe.click())
      await check(
        page,
        '青木 一郎だけにチェックが入り、日の表に青木 一郎の列だけが出て、「自分だけ」は押せなくなる',
        async () => {
          await expect(page.getByTestId('staff-filter-staff-staff-1')).toBeChecked()
          await expect(page.getByTestId('staff-filter-staff-staff-2')).not.toBeChecked()
          await expect(page.getByTestId('day-grid-staff-staff-1')).toBeVisible()
          await expect(page.getByTestId('day-grid-staff-staff-2')).toHaveCount(0)
          await expect(onlyMe).toBeDisabled()
        },
      )
    })
  })
})
