import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

/** 撮る画面。story の ID、表が出たことを示す要素、測る表を含む要素（省くと ready）、表を出すまでの操作。 */
const SCREENS = [
  {
    name: 'table-header-receipt-result',
    label: '照合の結果',
    story: '画面-receipt-receiptresultview--default',
    ready: (page: Page) => page.getByTestId('receipt-result-table'),
  },
  {
    name: 'table-header-option-search',
    label: '予定の作成の利用者の選択',
    story: '画面-schedule-scheduleformmodal--visit',
    ready: (page: Page) => page.getByTestId('schedule-field-patient'),
    table: (page: Page) => page.getByTestId('schedule-form'),
    open: async (page: Page) => {
      await page.getByTestId('schedule-field-patient').click()
    },
  },
  {
    name: 'table-header-patient-list',
    label: '利用者の一覧',
    story: '画面-patient-patientlistcontainer--default',
    ready: (page: Page) => page.getByTestId('patient-list-table'),
  },
  {
    name: 'table-header-staff-list',
    label: '職員の一覧',
    story: '画面-staff-stafflistcontainer--default',
    ready: (page: Page) => page.getByTestId('staff-list-table'),
  },
  {
    name: 'table-header-organization-list',
    label: '部署とチームの一覧',
    story: '画面-organization-organizationlistcontainer--default',
    ready: (page: Page) => page.getByTestId('organization-list-department-table'),
  },
  {
    name: 'table-header-calendar-link',
    label: 'カレンダーの連携の一覧',
    story: '画面-calendar-calendarlinkcontainer--default',
    ready: (page: Page) => page.getByTestId('calendar-link-table'),
  },
  {
    name: 'table-header-calendar-review',
    label: '確認が必要な予定の一覧',
    story: '画面-calendar-calendarreviewcontainer--default',
    ready: (page: Page) => page.getByTestId('calendar-review-table'),
  },
] as const

/**
 * scope の要素の中の、文字のある最初の見出しのセルの太さと、見出しの行の下の線の色を返す。
 * 線は、セルに線があればセルの線を、無ければ行の線を読む。表は border-collapse なので、どちらかが見える線になる。
 */
const headerStyle = (scope: Locator) =>
  scope.evaluate((element) => {
    const th = Array.from(element.querySelectorAll('th')).find(
      (cell) => (cell.textContent ?? '').trim() !== '',
    )
    if (th === undefined) return 'none'
    const cell = getComputedStyle(th)
    const row = th.parentElement === null ? cell : getComputedStyle(th.parentElement)
    const line = cell.borderBottomWidth !== '0px' ? cell : row
    return `「${(th.textContent ?? '').trim()}」の font-weight ${cell.fontWeight}、見出しの行の下の線 ${line.borderBottomColor}`
  })

test.describe('表の見出しのセル', () => {
  test.describe('幅 1280px の表（ログインなし、Storybook の story）', () => {
    for (const screen of SCREENS) {
      test(`${screen.name} ${screen.label}の表を幅 1280px で開いた場合、見出しのセルの太さと見出しの行の線を見られること`, async ({
        page,
      }) => {
        await page.goto(storyUrl(screen.story))
        await expect(screen.ready(page)).toBeVisible()
        if ('open' in screen) await screen.open(page)
        await intro(
          page,
          `${screen.label}の表の見出しのセルと、見出しの行の線を見る\n前提 ${screen.label}の画面（Storybook の story）を開いている`,
        )

        const style = await headerStyle('table' in screen ? screen.table(page) : screen.ready(page))
        await check(page, `最初の見出しのセルは ${style}`, async () => {
          expect(style).not.toBe('none')
        })
      })
    }
  })
})
