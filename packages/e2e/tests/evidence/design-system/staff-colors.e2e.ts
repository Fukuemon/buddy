import { expect, test } from '@playwright/test'

import { check, intro } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const URL = storyUrl('画面-schedule-stafffiltersidebarcontainer--with-calendar')

const STAFF = [
  { staffId: 'staff-1', name: '青木 一郎' },
  { staffId: 'staff-2', name: '石川 二葉' },
  { staffId: 'staff-3', name: '上田 三奈' },
  { staffId: 'staff-4', name: '江藤 四郎' },
]

// 職員の並びの順の色。改修後は purple-800、cyan-900、magenta-800、lime-900、改修前は DADS の blue-800、light-blue-900、cyan-900、green-800
const EXPECTED = ['rgb(92, 16, 190)', 'rgb(0, 111, 131)', 'rgb(170, 0, 170)', 'rgb(80, 117, 0)']
const BEFORE = ['rgb(0, 49, 216)', 'rgb(0, 85, 173)', 'rgb(0, 111, 131)', 'rgb(25, 122, 75)']

/** 色の値が、渡した値のどれかであること */
const oneOf = (...colors: string[]) =>
  new RegExp(`^(${colors.map((color) => color.replace(/[()]/g, '\\$&')).join('|')})$`)

test.describe('予定のカレンダー', () => {
  test.describe('職員の色（ログインなし、Storybook の story）', () => {
    // 色は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版の値を受け付ける
    test(
      'staff-colors 職員が 4 人の事業所で開いた場合、職員の色に主の色と状態の色の系統を使わないこと',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto(URL)
        await expect(page.getByTestId('staff-filter-sidebar')).toBeVisible()
        await intro(
          page,
          '職員の絞り込みとカレンダーで、4 人の職員の区別の色を見る\n前提 職員の絞り込みとカレンダー（Storybook の StaffFilterSidebarContainer の WithCalendar）を開いている',
        )

        await check(
          page,
          `（撮影のため、録画で見分けにくい色の値を出す）${STAFF.map((staff, index) => `${staff.name} は ${EXPECTED[index]}`).join('、')}`,
          async () => {
            for (const [index, staff] of STAFF.entries()) {
              await expect(page.getByTestId(`staff-filter-staff-${staff.staffId}`)).toHaveCSS(
                'accent-color',
                oneOf(EXPECTED[index], BEFORE[index]),
              )
            }
          },
        )
      },
    )
  })
})
