// DB を作り直してから単独で流す。担当の職員の選択肢は、ほかの spec が登録した職員が混ざると変わり、登録した職員は消せない
import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, OFFICE_CLERK, OFFICE_CLERK_STATE } from '../../fixtures/env'
import { patientNewStaffOptions } from '../../selectors/patientForm'

/** 利用者の登録の担当の職員の選択肢。シードの 1 つ目の事業所の、有効で訪問する職員が並ぶ。 */
const PATIENT_STAFF_OPTIONS = ['選んでください', '佐藤 美咲', '森 健太', '青木 陽菜', '林 さくら']

/** 予定のカレンダーを日の表示で開き、マネージャーの列が出るまで待つ。 */
const openDayCalendar = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

/** 予定のカレンダーを開き、ナビゲーションが出るまで待つ。 */
const openSchedule = async (page: Page) => {
  await page.goto('/schedule')
  await expect(page.getByTestId('site-nav')).toBeVisible()
}

test.describe('職員の管理', () => {
  test.describe('シードの訪問しない事務の職員', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
      test.use({ storageState: LOGIN_STATE })

      test('seed-clerk-calendar-column マネージャーが予定のカレンダーを開いた場合、シードの事務の職員の列が出ないこと', async ({
        page,
      }) => {
        await openSchedule(page)
        await intro(
          page,
          '予定のカレンダーに、シードの訪問しない事務の職員の列が出ない\n前提 シードで作り直した環境に、マネージャーでログインしている',
        )

        await step(page, '予定のカレンダーを日の表示で開く', () => openDayCalendar(page))
        await check(page, `${LOGIN_STAFF.name}の列は出て、${OFFICE_CLERK.name}の列は出ない`, () =>
          expect(page.getByTestId(`day-grid-staff-${OFFICE_CLERK.id}`)).toHaveCount(0),
        )
      })

      test('seed-clerk-staff-filter マネージャーが職員の絞り込みを見た場合、シードの事務の職員の項目が出ないこと', async ({
        page,
      }) => {
        await openDayCalendar(page)
        await intro(
          page,
          '職員の絞り込みに、シードの訪問しない事務の職員の項目が出ない\n前提 予定のカレンダーを日の表示で開いている',
        )

        const sidebar = page.getByTestId('staff-filter-sidebar')
        await step(page, '左の職員の絞り込みの項目を見る', () =>
          sidebar.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`).scrollIntoViewIfNeeded(),
        )
        await check(
          page,
          `${LOGIN_STAFF.name}の項目は出て、${OFFICE_CLERK.name}の項目は出ない`,
          async () => {
            await expect(sidebar.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(sidebar.getByTestId(`staff-filter-staff-${OFFICE_CLERK.id}`)).toHaveCount(
              0,
            )
          },
        )
      })

      test('seed-clerk-staff-list マネージャーが職員の一覧を開いた場合、シードの事務の職員が出ること', async ({
        page,
      }) => {
        await openSchedule(page)
        await intro(
          page,
          '職員の一覧に、シードの訪問しない事務の職員が出る\n前提 マネージャーでログインしている',
        )

        await step(page, 'ナビゲーションの「職員」を押す', () =>
          page.getByTestId('site-nav').getByTestId('site-nav-staff').click(),
        )
        await check(page, `職員の一覧に${OFFICE_CLERK.name}が出る`, () =>
          expect(page.getByTestId(`staff-list-row-${OFFICE_CLERK.id}`)).toBeVisible(),
        )
      })

      test('seed-clerk-staff-detail マネージャーがシードの事務の職員の詳細を開いた場合、訪問の行が「訪問しない」であること', async ({
        page,
      }) => {
        await page.goto('/staff')
        const row = page.getByTestId(`staff-list-row-${OFFICE_CLERK.id}`)
        await expect(row).toBeVisible()
        await intro(
          page,
          'シードの事務の職員の詳細で、訪問の行が「訪問しない」である\n前提 職員の一覧を開いている',
        )

        await step(page, `${OFFICE_CLERK.name}の行を押す`, () => row.click())
        await check(
          page,
          `${OFFICE_CLERK.name}の詳細が開き、訪問の行が「訪問しない」である`,
          async () => {
            await expect(page.getByTestId('staff-detail-name')).toHaveText(OFFICE_CLERK.name)
            await expect(page.getByTestId('staff-detail-visits')).toContainText('訪問しない')
          },
        )
      })

      test('seed-clerk-visit-assignee マネージャーが訪問の予定を作る場合、主訪問者の候補にシードの事務の職員が出ないこと', async ({
        page,
      }) => {
        await openDayCalendar(page)
        await intro(
          page,
          '訪問の予定を作るとき、主訪問者の候補にシードの訪問しない事務の職員が出ない\n前提 予定のカレンダーを日の表示で開いている',
        )

        await step(
          page,
          '「予定を作成」を押し、訪問の予定を選んで、項目の一覧の「主訪問者」を押す',
          async () => {
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-staff').click()
          },
        )
        await check(
          page,
          `主訪問者の候補に${LOGIN_STAFF.name}は出て、${OFFICE_CLERK.name}は出ない`,
          async () => {
            await expect(page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${OFFICE_CLERK.id}`)).toHaveCount(0)
          },
        )
      })

      test('seed-clerk-patient-staff マネージャーが利用者を登録する場合、担当の職員の候補にシードの事務の職員が出ないこと', async ({
        page,
      }) => {
        await page.goto('/patients')
        await expect(page.getByTestId('patient-list-new')).toBeVisible()
        await intro(
          page,
          '利用者を登録するとき、担当の職員の候補にシードの訪問しない事務の職員が出ない\n前提 利用者の一覧を開いている',
        )

        await step(page, '「利用者を登録」を押し、担当の職員の選択肢を見る', () =>
          page.getByTestId('patient-list-new').click(),
        )
        await check(
          page,
          `担当の職員の選択肢は「${PATIENT_STAFF_OPTIONS.join('」「')}」で、${OFFICE_CLERK.name}は出ない`,
          async () => {
            await expect(page.getByTestId('patient-new-staff')).toBeEnabled()
            await expect(patientNewStaffOptions(page)).toHaveText(PATIENT_STAFF_OPTIONS)
            await expect(patientNewStaffOptions(page, OFFICE_CLERK.name)).toHaveCount(0)
          },
        )
      })
    })

    test.describe(`${OFFICE_CLERK.name}（事務、訪問しない職員、照合の権限あり）`, () => {
      test.use({ storageState: OFFICE_CLERK_STATE })

      test('seed-clerk-receipt シードの事務の職員でログインした場合、照合の画面が開くこと', async ({
        page,
      }) => {
        await openSchedule(page)
        const nav = page.getByTestId('site-nav')
        await expect(nav).toBeVisible()
        await intro(
          page,
          `シードの訪問しない事務の職員でログインすると、照合の画面が開く\n前提 ${OFFICE_CLERK.name}でログインしている`,
        )

        await step(page, 'ナビゲーションの「照合」を押す', () =>
          nav.getByTestId('site-nav-receipt').click(),
        )
        await check(page, '照合の画面が開き、「照合する」のボタンが出る', async () => {
          await expect(page).toHaveURL(/\/receipt$/)
          await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
        })
      })
    })
  })
})
