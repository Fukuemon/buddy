import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

/** 職員がほかのウィンドウからこの画面に戻ったときと同じ合図を送り、画面にデータを読み直させる。 */
const returnToWindow = async (page: Page) => {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
}

/** 読み直しで読めない story と、読み終えたことを示す要素。 */
type Screen = {
  name: string
  label: string
  storyId: string
  storyName: string
  what: string
  shown: (page: Page) => Locator
}

const SCREENS: Screen[] = [
  {
    name: 'schedule-calendar-refetch-error',
    label: '予定のカレンダー',
    storyId: '画面-schedule-schedulecalendarcontainer--refetch-error',
    storyName: 'ScheduleCalendarContainer の RefetchError',
    what: '予定',
    shown: (page) => page.getByTestId('schedule-calendar'),
  },
  {
    name: 'calendar-link-refetch-error',
    label: 'カレンダーの連携',
    storyId: '画面-calendar-calendarlinkcontainer--refetch-error',
    storyName: 'CalendarLinkContainer の RefetchError',
    what: '結び付いたカレンダー',
    shown: (page) => page.getByTestId('calendar-link-table'),
  },
  {
    name: 'calendar-import-refetch-error',
    label: '予定の取り込み',
    storyId: '画面-calendar-calendarimportcontainer--refetch-error',
    storyName: 'CalendarImportContainer の RefetchError',
    what: '結び付いたカレンダー',
    shown: (page) => page.getByTestId('calendar-import-form'),
  },
  {
    name: 'calendar-review-refetch-error',
    label: '確認が必要な予定',
    storyId: '画面-calendar-calendarreviewcontainer--refetch-error',
    storyName: 'CalendarReviewContainer の RefetchError',
    what: '確認が必要な予定',
    shown: (page) => page.getByTestId('calendar-review-table'),
  },
  {
    name: 'calendar-cutover-refetch-error',
    label: '予定の正本の切り替え',
    storyId: '画面-calendar-calendarcutovercontainer--refetch-error',
    storyName: 'CalendarCutoverContainer の RefetchError',
    what: '切り替えの状況',
    shown: (page) => page.getByTestId('calendar-cutover-calendars'),
  },
  {
    name: 'staff-list-refetch-error',
    label: '職員の一覧',
    storyId: '画面-staff-stafflistcontainer--refetch-error',
    storyName: 'StaffListContainer の RefetchError',
    what: '職員',
    shown: (page) => page.getByTestId('staff-list-table'),
  },
  {
    name: 'patient-list-refetch-error',
    label: '利用者の一覧',
    storyId: '画面-patient-patientlistcontainer--refetch-error',
    storyName: 'PatientListContainer の RefetchError',
    what: '利用者',
    shown: (page) => page.getByTestId('patient-list-table'),
  },
  {
    name: 'patient-detail-refetch-error',
    label: '利用者の詳細',
    storyId: '画面-patient-patientdetailcontainer--refetch-error',
    storyName: 'PatientDetailContainer の RefetchError',
    what: '利用者',
    shown: (page) => page.getByTestId('patient-detail-name'),
  },
  {
    name: 'staff-detail-refetch-error',
    label: '職員の詳細',
    storyId: '画面-staff-staffdetailcontainer--refetch-error',
    storyName: 'StaffDetailContainer の RefetchError',
    what: '職員',
    shown: (page) => page.getByTestId('staff-detail-name'),
  },
  {
    name: 'organization-list-refetch-error',
    label: '部署とチーム',
    storyId: '画面-organization-organizationlistcontainer--refetch-error',
    storyName: 'OrganizationListContainer の RefetchError',
    what: '部署',
    shown: (page) => page.getByTestId('organization-list-department-table'),
  },
]

test.describe('読み直しの失敗', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    for (const screen of SCREENS) {
      test(`${screen.name} ${screen.label}を読み終えた後にウィンドウに戻って読み直し、読めなかった場合、表示を残して失敗の文と読み直すが出て、読み直すで消えること`, async ({
        page,
      }) => {
        await page.goto(storyUrl(screen.storyId))
        await expect(screen.shown(page)).toBeVisible()
        await intro(
          page,
          `${screen.label}で読み直して読めなかったときは、表示を残して失敗の文と読み直すを出す\n前提 ${screen.label}（Storybook の ${screen.storyName}）を読み終えている。次の読み直しで${screen.what}を読めず、その次は読める（架空のデータ）`,
        )

        await step(page, 'ほかのウィンドウからこの画面に戻り、画面がデータを読み直す', () =>
          returnToWindow(page),
        )
        await check(
          page,
          '読み終えた表示を残し、見出しの下に「最新の情報を読み込めませんでした。」と読み直すが出る',
          async () => {
            await expect(page.getByTestId('refetch-error')).toContainText(
              '最新の情報を読み込めませんでした。',
            )
            await expect(screen.shown(page)).toBeVisible()
          },
        )

        await step(page, '読み直すを押す', () => page.getByTestId('refetch-retry').click())
        await check(page, '読み直すを押して読めると、失敗の文と読み直すが消える', async () => {
          await expect(page.getByTestId('refetch-error')).toBeHidden()
          await expect(screen.shown(page)).toBeVisible()
        })
      })
    }
  })
})
