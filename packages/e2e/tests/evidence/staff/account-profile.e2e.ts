import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

test.describe('自分の情報', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の管理の権限を持たない職員がアカウントのメニューから自分の情報を開いた場合、自分の情報と持っている権限とカレンダーの連携が出て、職員の詳細へ移る操作が出ないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'account-profile-member',
          title: '管理の権限を持たない職員が、アカウントのメニューから自分の情報を開く',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await step('幅 390px で予定のカレンダーを開いている。アカウントのメニューを開く')
          await page.getByTestId('viewer-menu-open').click()
          await expect(page.getByTestId('viewer-profile')).toBeVisible()
          await check('メニューの名前とログアウトの間に「自分の情報」が出る')

          await step('「自分の情報」を押す')
          await page.getByTestId('viewer-profile').click()
          await expect(page.getByTestId('account-profile-name')).toHaveText(LEADER.staff.name)
          await expect(page.getByTestId('account-profile-policy-list')).toBeVisible()
          await expect(page.getByTestId('account-profile-staff-detail')).toHaveCount(0)
          await check(
            '名前、メール、部署、チーム、役職、持っている権限の名前が出て、「職員の詳細を開く」は出ない',
          )

          await step('(撮影のため、カレンダーの連携まで送る)')
          await page.getByTestId('account-profile-calendar').scrollIntoViewIfNeeded()
          await expect(page.getByTestId('account-profile-calendar-not-linked')).toHaveText(
            '連携していません。連携は、事業所の管理者に頼んでください。',
          )
          await check(
            'カレンダーを連携していないことと、「連携は、事業所の管理者に頼んでください。」が出る',
          )
        },
      )
    })

    test(`${prefix}職員の管理の権限を持つ職員が自分の情報で職員の詳細を開くを押した場合、自分の職員の詳細の画面へ移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'account-profile-manager',
          title: '管理の権限を持つ職員が、自分の情報から自分の職員の詳細へ移る',
          actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`,
          variant,
        },
        async (page) => {
          await page.goto('/me')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await step('自分の情報を開く')
          await page.goto('/me')
          await expect(page.getByTestId('account-profile-staff-detail')).toBeVisible()
          await check('ページのタイトルの右に「職員の詳細を開く」が出る')

          await step('「職員の詳細を開く」を押す')
          await page.getByTestId('account-profile-staff-detail').click()
          await expect(page).toHaveURL(new RegExp(`/staff/${LOGIN_STAFF.id}$`))
          await expect(page.getByTestId('staff-detail-name')).toHaveText(LOGIN_STAFF.name)
          await check(`自分（${LOGIN_STAFF.name}）の職員の詳細の画面に移る`)
        },
      )
    })
  }
})
