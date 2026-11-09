import { expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import {
  BROKER_INTERNAL_URL,
  BROKER_URL,
  LEADER,
  LOGIN_EMAIL,
  LOGIN_STATE,
  OFFICE_B,
} from '../../fixtures/env'
import {
  issueManagerToken,
  listPositions,
  newStaff,
  registerStaff,
  STAFF_FORM,
} from '../../fixtures/staff'
import { enterEmailAtBroker, signInAtBroker } from '../../screens/login'

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

      // ブローカーに職員ができていれば、上流の IdP へリダイレクトされる。できていなければ、登録していないメールと同じく失敗する
      await page.goto('/schedule')
      await enterEmailAtBroker(page, staff.email)

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
    })

    test('ほかの事業所の職員のメールで職員を登録しようとした場合、事業所を示さない 409 が返りその職員はログインできること', async ({
      page,
      request,
    }) => {
      const manager = await issueAccessToken(request, LOGIN_EMAIL)
      const res = await registerStaff(request, manager, {
        email: OFFICE_B.email,
        name: 'E2E taken',
      })
      expect(res.status()).toBe(409)
      expect(await res.json()).toEqual({
        code: 'conflict',
        message: `メール ${OFFICE_B.email} の職員は登録できません`,
      })

      await page.goto('/schedule?view=day')
      await signInAtBroker(page, OFFICE_B.email)

      await expect(page).toHaveURL(/\/schedule\?view=day$/)
      await expect(page.getByTestId('viewer-menu')).toContainText(OFFICE_B.staff.name)
    })
  })
})

test.describe('ブローカーの内部の API', () => {
  test.describe('職員の登録', () => {
    test('client credentials のトークンなしで呼んだ場合、401 が返ること', async ({ request }) => {
      const data = { org_id: 'org-sample', email: newStaff('internal').email }

      const anonymous = await request.post(`${BROKER_INTERNAL_URL}/internal/staff`, { data })
      expect(anonymous.status()).toBe(401)

      // 職員の access token の aud は schedule と receipt で、ブローカーは受けない
      const staffToken = await issueAccessToken(request, LOGIN_EMAIL)
      const withStaffToken = await request.post(`${BROKER_INTERNAL_URL}/internal/staff`, {
        data,
        headers: { Authorization: `Bearer ${staffToken}` },
      })
      expect(withStaffToken.status()).toBe(401)
    })

    test('ログインの画面のポートで呼んだ場合、404 が返ること', async ({ request }) => {
      const data = { org_id: 'org-sample', email: newStaff('public').email }

      const res = await request.post(`${BROKER_URL}/internal/staff`, { data })
      expect(res.status()).toBe(404)
    })
  })
})

test.describe('職員の一覧', () => {
  // ファイルの既定はログインしていない状態なので、職員の管理の画面はマネージャーでログインした状態で開く
  test.use({ storageState: LOGIN_STATE })

  test.describe('職員の登録', () => {
    test('職員の管理の権限を持つ職員がメールアドレスと役職で職員を登録した場合、一覧に出て、役職に決まっている権限が付くこと', async ({
      page,
      request,
    }) => {
      const staff = newStaff('screen')
      const positions = await listPositions(request, await issueManagerToken(request))
      const member = positions.find((p) => p.id === STAFF_FORM.positionId)
      expect(member).toBeDefined()

      await page.goto('/staff')
      await page.getByTestId('staff-list-new').click()
      const dialog = page.getByTestId('staff-new-dialog')
      await dialog.getByTestId('staff-new-name').fill(staff.name)
      await dialog.getByTestId('staff-new-email').fill(staff.email)
      await dialog.getByTestId('staff-new-position').selectOption(STAFF_FORM.positionId)
      await dialog.getByTestId('staff-new-submit').click()

      await expect(page).toHaveURL(/\/staff\/[0-9A-HJKMNP-TV-Z]{26}$/)
      await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
      await page.getByTestId('staff-detail-tab-policies').click()
      const positionGroup = page.getByTestId('staff-policy-group-position')
      await expect(positionGroup).toContainText(`役職「${member?.name}」で付く権限`)
      for (const { code } of member?.policies ?? []) {
        await expect(positionGroup.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
      }
      await expect(page.getByTestId('staff-policy-group-individual')).toHaveCount(0)

      await page.getByTestId('staff-detail-back').click()
      await page.getByTestId('staff-list-search').fill(staff.name)
      await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
      await expect(page.getByTestId('staff-list-table')).toContainText(staff.name)
    })
  })
})
