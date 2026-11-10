import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'

test.describe('自分の情報', () => {
  test.describe(`${LEADER.staff.name}（チームリーダー、職員の管理の権限なし、幅 390px）`, () => {
    test.use({ storageState: LEADER_STATE, viewport: PHONE_VIEWPORT })

    test('account-profile-member 職員の管理の権限を持たない職員がアカウントのメニューから自分の情報を開いた場合、自分の情報と持っている権限とカレンダーの連携が出て、職員の詳細へ移る操作が出ないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('viewer-menu-open')).toBeVisible()
      await intro(page, '管理の権限を持たない職員が、アカウントのメニューから自分の情報を開く')

      await step(page, '幅 390px で予定のカレンダーを開いている。アカウントのメニューを開く', () =>
        page.getByTestId('viewer-menu-open').click(),
      )
      await check(page, 'メニューの名前とログアウトの間に「自分の情報」が出る', () =>
        expect(page.getByTestId('viewer-profile')).toBeVisible(),
      )

      await step(page, '「自分の情報」を押す', () => page.getByTestId('viewer-profile').click())
      await check(
        page,
        '名前、メール、部署、チーム、役職、持っている権限の名前が出て、「職員の詳細を開く」は出ない',
        async () => {
          await expect(page.getByTestId('account-profile-name')).toHaveText(LEADER.staff.name)
          await expect(page.getByTestId('account-profile-policy-list')).toBeVisible()
          await expect(page.getByTestId('account-profile-staff-detail')).toHaveCount(0)
        },
      )

      await step(page, '（撮影のため、カレンダーの連携まで送る）', () =>
        page.getByTestId('account-profile-calendar').scrollIntoViewIfNeeded(),
      )
      await check(
        page,
        'カレンダーを連携していないことと、「連携は、事業所の管理者に頼んでください。」が出る',
        () =>
          expect(page.getByTestId('account-profile-calendar-not-linked')).toHaveText(
            '連携していません。連携は、事業所の管理者に頼んでください。',
          ),
      )
    })
  })

  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('account-profile-manager 職員の管理の権限を持つ職員が自分の情報で職員の詳細を開くを押した場合、自分の職員の詳細の画面へ移ること', async ({
      page,
    }) => {
      await page.goto('/me')
      await expect(page.getByTestId('account-profile-name')).toBeVisible()
      await intro(page, '管理の権限を持つ職員が、自分の情報から自分の職員の詳細へ移る')

      await check(
        page,
        '前提 自分の情報を開いている。ページのタイトルの右に「職員の詳細を開く」が出る',
        () => expect(page.getByTestId('account-profile-staff-detail')).toBeVisible(),
      )

      await step(page, '「職員の詳細を開く」を押す', () =>
        page.getByTestId('account-profile-staff-detail').click(),
      )
      await check(page, `自分（${LOGIN_STAFF.name}）の職員の詳細の画面に移る`, async () => {
        await expect(page).toHaveURL(new RegExp(`/staff/${LOGIN_STAFF.id}$`))
        await expect(page.getByTestId('staff-detail-name')).toHaveText(LOGIN_STAFF.name)
      })
    })
  })
})
