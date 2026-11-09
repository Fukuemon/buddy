import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const URL = storyUrl('画面-schedule-stafffiltersidebarcontainer--with-calendar')

const STAFF = [
  { staffId: 'staff-1', name: '青木 一郎' },
  { staffId: 'staff-2', name: '石川 二葉' },
  { staffId: 'staff-3', name: '上田 三奈' },
  { staffId: 'staff-4', name: '江藤 四郎' },
]

// 職員の並びの順の色。改修前は DADS の blue-800、light-blue-900、cyan-900、green-800、改修後は purple-800、cyan-900、magenta-800、lime-900
const EXPECTED = {
  before: ['rgb(0, 49, 216)', 'rgb(0, 85, 173)', 'rgb(0, 111, 131)', 'rgb(25, 122, 75)'],
  after: ['rgb(92, 16, 190)', 'rgb(0, 111, 131)', 'rgb(170, 0, 170)', 'rgb(80, 117, 0)'],
}

const openCalendar = async (page: Page) => {
  await page.goto(URL)
  await expect(page.getByTestId('staff-filter-sidebar')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''
    const expected = variant.name === 'before' ? EXPECTED.before : EXPECTED.after

    test(`${prefix}職員が 4 人の事業所で開いた場合、職員の色に主の色と状態の色の系統を使わないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-colors',
          title: '職員の絞り込みとカレンダーで、4 人の職員の区別の色を見る',
          actor: ACTOR,
          variant,
        },
        openCalendar,
        async ({ page, step, check }) => {
          await openCalendar(page)
          await step(
            '職員の絞り込みとカレンダー（Storybook の StaffFilterSidebarContainer の WithCalendar）を開いている',
          )
          for (const [index, staff] of STAFF.entries()) {
            await expect(page.getByTestId(`staff-filter-staff-${staff.staffId}`)).toHaveCSS(
              'accent-color',
              expected[index],
            )
          }
          await check(
            `（撮影のため、録画で見分けにくい色の値を出す）${STAFF.map((staff, index) => `${staff.name} は ${expected[index]}`).join('、')}`,
          )
        },
      )
    })
  }
})
