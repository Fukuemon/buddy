import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, mockUrl, recordPrEvidence } from '../../fixtures/evidence'

const LIST = 'staff-list_職員の一覧/mocks/01-list.html'
const DETAIL = 'staff-detail_職員の詳細/mocks/01-detail.html'

test.describe('職員の管理の画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の一覧のモックで職員の名前を押した場合、職員の詳細のモックへ移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-list',
          title:
            '職員の一覧のモックに休職と退職の印が出て、職員の名前を押すと職員の詳細のモックへ移る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(LIST))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(LIST))
          const statuses = page.getByTestId('staff-list-status-{職員の id}')
          await expect(statuses.nth(3)).toHaveText('休職（2027/04/01 に戻る予定）')
          await expect(statuses.nth(5)).toHaveText('退職（2026/09/30）')
          await check('職員の一覧のモック（01-list.html）に、休職と退職の印が出ている')

          await step('林 さくら の名前を押す')
          await page.getByTestId('staff-list-open-{職員の id}').nth(1).click()
          await expect(page).toHaveURL(/staff-detail_.+\/01-detail\.html/)
          await check('職員の詳細のモック（01-detail.html）へ移る')
        },
      )
    })

    test(`${prefix}職員の一覧のモックで職員を登録を押した場合、職員の登録のモックへ移り、登録で詳細のモックへ移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-new',
          title:
            '職員を登録を押すと職員の登録のモックへ移り、登録を押すと登録した職員の詳細のモックへ移る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(LIST))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(LIST))
          await expect(page.getByTestId('staff-list-new')).toBeVisible()
          await step('職員の一覧のモック（01-list.html）を開いている')

          await step('「職員を登録」を押す')
          await page.getByTestId('staff-list-new').click()
          await expect(page).toHaveURL(/staff-new_.+\/01-initial\.html/)
          await expect(page.getByTestId('staff-new-dialog')).toBeVisible()
          await check(
            '職員の登録のモック（01-initial.html）へ移り、名前、メールアドレス、電話番号、部署、チーム、役職の欄が出る',
          )

          await step('「登録」を押す')
          await page.getByTestId('staff-new-submit').click()
          await expect(page).toHaveURL(/staff-detail_.+\/01-detail\.html/)
          await check('登録した職員の詳細のモック（01-detail.html）へ移る')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで編集を押した場合、基本の情報の編集のモックへ移り、キャンセルで詳細へ戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-detail',
          title:
            '職員の詳細のモックで編集を押すと基本の情報の編集のモックへ移り、キャンセルで詳細へ戻る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(DETAIL))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(DETAIL))
          await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
          await check(
            '職員の詳細のモック（01-detail.html）に、基本の情報、役職、権限、在籍が出ている',
          )

          await step('基本の情報の「編集」を押す')
          await page.getByTestId('staff-detail-edit').click()
          await expect(page).toHaveURL(/02-edit\.html/)
          await expect(page.getByTestId('staff-detail-team-input')).toBeVisible()
          await check(
            '基本の情報の編集のモック（02-edit.html）へ移り、名前、電話番号、部署、チームの欄が出る',
          )

          await step('「キャンセル」を押す')
          await page.getByTestId('staff-detail-edit-cancel').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('職員の詳細のモック（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで役職を変えると権限を足すを押した場合、それぞれのダイアログのモックへ移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-position-policy',
          title:
            '役職を変えると権限を足すのダイアログのモックで選び、権限の一覧の行ごとに外すが出る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(DETAIL))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(DETAIL))
          await expect(page.getByTestId('staff-policy-remove-{職員の権限の id}')).toHaveCount(2)
          await check(
            '職員の詳細のモック（01-detail.html）の権限の一覧の行ごとに、「外す」が出ている',
          )

          await step('「役職を変える」を押す')
          await page.getByTestId('staff-detail-position-change').click()
          await expect(page).toHaveURL(/03-position\.html/)
          await expect(page.getByTestId('staff-position-dialog')).toBeVisible()
          await check(
            '役職を変えるダイアログのモック（03-position.html）へ移り、権限が置き換わる注意が出る',
          )

          await step('「マネージャー」を選び、「キャンセル」を押す')
          const positions = page.getByTestId('staff-position-option-{役職の id}')
          await positions.first().click()
          await expect(positions.first()).toHaveAttribute('aria-checked', 'true')
          await page.getByTestId('staff-position-cancel').click()
          await expect(page).toHaveURL(/01-detail\.html/)

          await step('「権限を足す」を押す')
          await page.getByTestId('staff-policy-add').click()
          await expect(page).toHaveURL(/04-add-policy\.html/)
          await expect(page.getByTestId('staff-policy-add-targets')).toBeVisible()
          await check(
            '権限を足すダイアログのモック（04-add-policy.html）へ移り、付いている権限は選べず、対象のチームを選べる',
          )

          await step('対象の「西チーム」を選ぶ')
          const target = page.getByTestId('staff-policy-add-target-{チームの id}').nth(1)
          await target.click()
          await expect(target).toHaveAttribute('aria-checked', 'true')
          await check('「西チーム」が選ばれる')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで休職にするを押した場合、残る予定と担当の一覧を出した休職のダイアログのモックへ移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-leave',
          title:
            '休職にするを押すと残る予定と担当の利用者を出した休職のダイアログのモックへ移り、確定で休職の職員のモックへ移る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(DETAIL))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(DETAIL))
          await expect(page.getByTestId('staff-detail-leave')).toBeVisible()
          await step('有効な職員の詳細のモック（01-detail.html）を開いている')

          await step('「休職にする」を押す')
          await page.getByTestId('staff-detail-leave').click()
          await expect(page).toHaveURL(/05-leave\.html/)
          await expect(page.getByTestId('staff-leave-assignments')).toBeVisible()
          await check(
            '休職のダイアログのモック（05-leave.html）へ移り、残る予定、繰り返しの予定、担当の利用者が出る',
          )

          await step('ダイアログの「休職にする」を押す')
          await page.getByTestId('staff-leave-submit').click()
          await expect(page).toHaveURL(/06-on-leave\.html/)
          await expect(page.getByTestId('staff-detail-reinstate')).toBeVisible()
          await check('休職の職員のモック（06-on-leave.html）へ移り、「復職にする」が出る')

          await step('「復職にする」を押す')
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await expect(page.getByTestId('staff-detail-status')).toHaveText('有効')
          await check('有効な職員の詳細のモック（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}職員の詳細のモックで予定が残る職員の退職にするを押した場合、退職を拒むダイアログのモックへ移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-retire-refused',
          title:
            '予定が残る職員の退職にするを押すと、残る一覧を出して退職にするを押せないダイアログのモックへ移る',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(DETAIL))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(DETAIL))
          await expect(page.getByTestId('staff-detail-retire')).toBeVisible()
          await step('予定と担当の利用者が残る職員の詳細のモック（01-detail.html）を開いている')

          await step('「退職にする」を押す')
          await page.getByTestId('staff-detail-retire').click()
          await expect(page).toHaveURL(/08-retire-refused\.html/)
          await expect(page.getByTestId('staff-retire-assignments')).toBeVisible()
          await expect(page.getByTestId('staff-retire-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
          await check(
            '退職を拒むダイアログのモック（08-retire-refused.html）へ移り、残る一覧が出て、「退職にする」を押せない',
          )

          await step('「キャンセル」を押す')
          await page.getByTestId('staff-retire-cancel').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('職員の詳細のモック（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が職員の一覧を開いた場合、権限が無いのモックになること`, async ({
      browser,
    }) => {
      const forbidden = 'staff-list_職員の一覧/mocks/04-forbidden.html'
      await recordPrEvidence(
        browser,
        {
          name: 'staff-mock-forbidden',
          title:
            '職員の管理の権限を持たない職員の権限が無いのモックに、職員のナビゲーションが無く、予定のカレンダーへ戻れる',
          actor: 'ログインなし',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(forbidden))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(forbidden))
          await expect(page.getByTestId('page-forbidden')).toBeVisible()
          await expect(page.getByTestId('site-nav-staff')).toHaveCount(0)
          await check(
            '権限が無いのモック（04-forbidden.html）に、権限が無いことが出て、ナビゲーションに「職員」が無い',
          )

          await step('「予定のカレンダーへ」を押す')
          await page.getByTestId('page-forbidden-back').click()
          await expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/)
          await check('予定のカレンダーのモック（01-month.html）へ移る')
        },
      )
    })
  }
})
