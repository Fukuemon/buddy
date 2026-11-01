import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, OFFICE_CLERK } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { patientNewStaffOptions } from '../../selectors/patientForm'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** 利用者の登録の担当の職員の選択肢。シードの 1 つ目の事業所の、有効で訪問する職員が並ぶ。 */
const PATIENT_STAFF_OPTIONS = ['選んでください', '佐藤 美咲', '森 健太', '青木 陽菜', '林 さくら']

const CLERK = `${OFFICE_CLERK.name}（事務、訪問しない職員、照合の権限あり）`

const signInManager = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 予定のカレンダーを日の表示で開き、マネージャーの列が出るまで待つ。 */
const openDayCalendar = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

test.describe('職員の管理', () => {
  test.describe('シードの訪問しない事務の職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}マネージャーが予定のカレンダーを開いた場合、シードの事務の職員の列が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-calendar-column',
            title: '予定のカレンダーに、シードの訪問しない事務の職員の列が出ない',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step('シードで作り直した環境に、マネージャーでログインしている')

            await step('予定のカレンダーを日の表示で開く')
            await openDayCalendar(page)
            await expect(page.getByTestId(`day-grid-staff-${OFFICE_CLERK.id}`)).toHaveCount(0)
            await check(`${LOGIN_STAFF.name}の列は出て、${OFFICE_CLERK.name}の列は出ない`)
          },
        )
      })

      test(`${prefix}マネージャーが職員の絞り込みを見た場合、シードの事務の職員の項目が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-staff-filter',
            title: '職員の絞り込みに、シードの訪問しない事務の職員の項目が出ない',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await openDayCalendar(page)
            await step('予定のカレンダーを日の表示で開いている')

            const sidebar = page.getByTestId('staff-filter-sidebar')
            await step('左の職員の絞り込みの項目を見る')
            await expect(sidebar.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(sidebar.getByTestId(`staff-filter-staff-${OFFICE_CLERK.id}`)).toHaveCount(
              0,
            )
            await check(`${LOGIN_STAFF.name}の項目は出て、${OFFICE_CLERK.name}の項目は出ない`)
          },
        )
      })

      test(`${prefix}マネージャーが職員の一覧を開いた場合、シードの事務の職員が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-staff-list',
            title: '職員の一覧に、シードの訪問しない事務の職員が出る',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step('マネージャーでログインしている')

            await step('ナビゲーションの「職員」を押す')
            await page.getByTestId('site-nav').getByTestId('site-nav-staff').click()
            await expect(page.getByTestId(`staff-list-row-${OFFICE_CLERK.id}`)).toBeVisible()
            await check(`職員の一覧に${OFFICE_CLERK.name}が出る`)
          },
        )
      })

      test(`${prefix}マネージャーがシードの事務の職員の詳細を開いた場合、訪問の行が「訪問しない」であること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-staff-detail',
            title: 'シードの事務の職員の詳細で、訪問の行が「訪問しない」である',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await page.goto('/staff')
            await expect(page.getByTestId(`staff-list-row-${OFFICE_CLERK.id}`)).toBeVisible()
            await step('職員の一覧を開いている')

            await step(`${OFFICE_CLERK.name}の行を押す`)
            await page.getByTestId(`staff-list-row-${OFFICE_CLERK.id}`).click()
            await expect(page.getByTestId('staff-detail-name')).toHaveText(OFFICE_CLERK.name)
            await expect(page.getByTestId('staff-detail-visits')).toContainText('訪問しない')
            await check(`${OFFICE_CLERK.name}の詳細が開き、訪問の行が「訪問しない」である`)
          },
        )
      })

      test(`${prefix}マネージャーが訪問の予定を作る場合、主訪問者の候補にシードの事務の職員が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-visit-assignee',
            title: '訪問の予定を作るとき、主訪問者の候補にシードの訪問しない事務の職員が出ない',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await openDayCalendar(page)
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、訪問の予定を選んで、項目の一覧の「主訪問者」を押す')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-staff').click()
            await expect(page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${OFFICE_CLERK.id}`)).toHaveCount(0)
            await check(`主訪問者の候補に${LOGIN_STAFF.name}は出て、${OFFICE_CLERK.name}は出ない`)
          },
        )
      })

      test(`${prefix}マネージャーが利用者を登録する場合、担当の職員の候補にシードの事務の職員が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-patient-staff',
            title: '利用者を登録するとき、担当の職員の候補にシードの訪問しない事務の職員が出ない',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await page.goto('/patients')
            await step('利用者の一覧を開いている')

            await step('「利用者を登録」を押し、担当の職員の選択肢を見る')
            await page.getByTestId('patient-list-new').click()
            await expect(page.getByTestId('patient-new-staff')).toBeEnabled()
            await expect(patientNewStaffOptions(page)).toHaveText(PATIENT_STAFF_OPTIONS)
            await expect(patientNewStaffOptions(page, OFFICE_CLERK.name)).toHaveCount(0)
            await check(
              `担当の職員の選択肢は「${PATIENT_STAFF_OPTIONS.join('」「')}」で、${OFFICE_CLERK.name}は出ない`,
            )
          },
        )
      })

      test(`${prefix}シードの事務の職員でログインした場合、照合の画面が開くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'seed-clerk-receipt',
            title: 'シードの訪問しない事務の職員でログインすると、照合の画面が開く',
            actor: CLERK,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_CLERK.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            const nav = page.getByTestId('site-nav')
            await expect(nav).toBeVisible()
            await step(`${OFFICE_CLERK.name}でログインしている`)

            await step('ナビゲーションの「照合」を押す')
            await nav.getByTestId('site-nav-receipt').click()
            await expect(page).toHaveURL(/\/receipt$/)
            await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
            await check('照合の画面が開き、「照合する」のボタンが出る')
          },
        )
      })
    }
  })
})
