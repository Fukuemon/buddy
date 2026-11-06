import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

/** 撮る画面。story の ID、表が出たことを示す testid、表を出すまでの操作。 */
const SCREENS = [
  {
    name: 'table-header-receipt-result',
    label: '照合の結果',
    story: '画面-receipt-receiptresultview--default',
    ready: 'receipt-result-table',
  },
  {
    name: 'table-header-option-search',
    label: '予定の作成の利用者の選択',
    story: '画面-schedule-scheduleformmodal--visit',
    ready: 'schedule-field-patient',
    table: 'schedule-form',
    open: async (page: Page) => {
      await page.getByTestId('schedule-field-patient').click()
    },
  },
  {
    name: 'table-header-patient-list',
    label: '利用者の一覧',
    story: '画面-patient-patientlistcontainer--default',
    ready: 'patient-list-table',
  },
  {
    name: 'table-header-staff-list',
    label: '職員の一覧',
    story: '画面-staff-stafflistcontainer--default',
    ready: 'staff-list-table',
  },
  {
    name: 'table-header-organization-list',
    label: '部署とチームの一覧',
    story: '画面-organization-organizationlistcontainer--default',
    ready: 'organization-list-department-table',
  },
  {
    name: 'table-header-calendar-link',
    label: 'カレンダーの連携の一覧',
    story: '画面-calendar-calendarlinkcontainer--default',
    ready: 'calendar-link-table',
  },
  {
    name: 'table-header-calendar-review',
    label: '確認が必要な予定の一覧',
    story: '画面-calendar-calendarreviewcontainer--default',
    ready: 'calendar-review-table',
  },
] as const

/**
 * testid の要素の中の、文字のある最初の見出しのセルの太さと、見出しの行の下の線の色を返す。
 * 線は、セルに線があればセルの線を、無ければ行の線を読む。表は border-collapse なので、どちらかが見える線になる。
 */
const headerStyle = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((element) => {
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
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    for (const screen of SCREENS) {
      test(`${prefix}${screen.label}の表を幅 1280px で開いた場合、見出しのセルの太さと見出しの行の線を見られること`, async ({
        browser,
      }) => {
        const open = async (page: Page) => {
          await page.goto(storyUrl(screen.story))
          await expect(page.getByTestId(screen.ready)).toBeVisible()
          if ('open' in screen) await screen.open(page)
        }
        await recordPrEvidence(
          browser,
          {
            name: screen.name,
            title: `${screen.label}の表の見出しのセルと、見出しの行の線を見る`,
            actor: ACTOR,
            variant,
          },
          open,
          async ({ page, step, check }) => {
            await open(page)
            await step(`${screen.label}の画面（Storybook の story）を開いている`)
            const style = await headerStyle(page, 'table' in screen ? screen.table : screen.ready)
            expect(style).not.toBe('none')
            await check(`最初の見出しのセルは ${style}`)
          },
        )
      })
    }
  }
})
