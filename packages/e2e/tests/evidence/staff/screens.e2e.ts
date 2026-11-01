import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaffId,
  STAFF_FORM,
} from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーでログインする。 */
const signInManager = async (page: Page) => {
  await page.goto('/staff')
  await signInAtBroker(page, LOGIN_EMAIL)
}

test.describe('職員の管理', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員を登録した場合、職員の一覧に出ること`, async ({ browser }) => {
      const staff = newStaff('evidence')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-register-list',
          title: 'メールアドレスと役職で職員を登録すると、職員の一覧に出る',
          actor: MANAGER,
          variant,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-table')).toBeVisible()
          await step('職員の一覧を開いている')

          await step('「職員を登録」を押し、名前、メールアドレス、役職「メンバー」を入れて登録する')
          await page.getByTestId('staff-list-new').click()
          const dialog = page.getByTestId('staff-new-dialog')
          await dialog.getByTestId('staff-new-name').fill(staff.name)
          await dialog.getByTestId('staff-new-email').fill(staff.email)
          await dialog.getByTestId('staff-new-position').selectOption(STAFF_FORM.positionId)
          await dialog.getByTestId('staff-new-submit').click()
          await expect(dialog).toHaveCount(0)

          await step('名前で検索する')
          await page.getByTestId('staff-list-search').fill(staff.name)
          await expect(page.getByTestId('staff-list-table')).toContainText(staff.name)
          await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
          await check('登録した職員が一覧に出る')
        },
      )
    })

    test(`${prefix}一覧を開いた場合、有効の職員がチームの順に並び、休職で絞り込むと戻る予定の日が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-list-filter',
          title: '一覧は有効の職員だけをチームの順に出し、休職で絞り込むと戻る予定の日の列が出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await signInManager(page)
          const token = await issueManagerToken(page.request)
          const id = await registerStaffId(page.request, token, newStaff('on-leave'))
          await leaveStaff(page.request, token, id)
          return { id }
        },
        async ({ page, step, check }, { id }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-filter-status')).toHaveValue('active')
          await expect(page.getByTestId(`staff-list-row-${id}`)).toHaveCount(0)
          await check('開いた直後は状態が「有効」で、有効の職員だけがチームの順、名前の順に並ぶ')

          await step('状態の絞り込みを「休職」にする')
          await page.getByTestId('staff-list-filter-status').selectOption('on_leave')
          await expect(page.getByTestId(`staff-list-leave-return-${id}`)).toHaveText(
            '戻る予定の日なし',
          )
          await check('休職の職員だけが並び、「戻る予定の日」の列が出る')
        },
      )
    })

    test(`${prefix}スマートフォンの幅で一覧を開いた場合、2 行のリストになり横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-list-phone',
          title: 'スマートフォンの幅では、一覧が名前と、チーム・役職・部署の 2 行のリストになる',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-table')).toBeVisible()
          await step('幅 390px で職員の一覧を開いている')

          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(PHONE_VIEWPORT.width)
          await check('行は 1 行目に名前、2 行目にチーム・役職・部署で、横にスクロールしない')
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が職員の画面を開いた場合、権限が無い表示になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-forbidden',
          title: '職員の管理の権限を持たない職員には、職員の画面を出さない',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
        },
        async (page) => {
          await page.goto('/staff')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          for (const url of ['/staff', '/staff/new']) {
            await step(`${url} を開く`)
            await page.goto(url)
            await expect(page.getByTestId('page-forbidden')).toBeVisible()
            await expect(page.getByTestId('site-nav')).not.toContainText('職員')
            await check('「この画面を開く権限がありません」が出て、ナビゲーションに「職員」が無い')
          }
        },
      )
    })
  }
})
