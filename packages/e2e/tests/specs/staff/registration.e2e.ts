import { expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { BROKER_URL, LEADER, LOGIN_EMAIL } from '../../fixtures/env'
import { newStaff, registerStaff } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('職員の登録', () => {
    test('職員の管理の権限を持つ職員が職員を登録した場合、登録した職員がログインすると予定のカレンダーが開きその職員の名前が出ること', async ({
      page,
      request,
    }) => {
      const staff = newStaff('registered')
      const manager = await issueAccessToken(request, LOGIN_EMAIL)
      const res = await registerStaff(request, manager, staff)
      expect(res.status()).toBe(201)

      await page.goto('/schedule?view=day')
      await signInAtBroker(page, staff.email)

      await expect(page).toHaveURL(/\/schedule\?view=day$/)
      await expect(page.getByTestId('viewer-menu')).toContainText(staff.name)
    })

    test('職員の管理の権限を持たない職員が職員を登録しようとした場合、403 が返りその職員はログインできないこと', async ({
      page,
      request,
    }) => {
      const staff = newStaff('denied')
      const leader = await issueAccessToken(request, LEADER.email)
      const res = await registerStaff(request, leader, staff)
      expect(res.status()).toBe(403)

      // ブローカーに職員ができていれば、上流の IdP へ転送される。できていなければ、登録していないメールと同じく失敗する
      await page.goto('/schedule')
      await brokerLogin(page).email.fill(staff.email)
      await brokerLogin(page).next.click()

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
    })
  })
})

test.describe('ブローカーの内部の API', () => {
  test.describe('職員の登録', () => {
    test('client credentials のトークンなしで呼んだ場合、401 が返ること', async ({ request }) => {
      const data = { org_id: 'org-sample', email: newStaff('internal').email }

      const anonymous = await request.post(`${BROKER_URL}/internal/staff`, { data })
      expect(anonymous.status()).toBe(401)

      // 職員の access token の aud は schedule と receipt で、ブローカーは受けない
      const staffToken = await issueAccessToken(request, LOGIN_EMAIL)
      const withStaffToken = await request.post(`${BROKER_URL}/internal/staff`, {
        data,
        headers: { Authorization: `Bearer ${staffToken}` },
      })
      expect(withStaffToken.status()).toBe(401)
    })
  })
})
