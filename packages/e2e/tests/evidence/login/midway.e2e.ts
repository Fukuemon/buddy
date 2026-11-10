import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { BASE_URL, LOGIN_STAFF, TEAM_MEMBER } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaffId,
  retireStaff,
} from '../../fixtures/staff'
import { enterEmailAtBroker, signInAtUpstreamIdp } from '../../screens/login'
import { brokerPage } from '../../selectors/broker'
import { idpLogin } from '../../selectors/idp'

/** 録画の外では、ログインせずに web の origin を開いておく。録画の中で、ログインの画面から操作する。 */
const openWeb = async (page: Page) => {
  await page.goto(`${BASE_URL}/auth/error`)
}

/** 登録していないメールと有効でない職員のログインで出す文。 */
const DENIED_MESSAGE =
  '入れたメールアドレスでは、ログインできません。事業所の管理者に、登録のメールアドレスを確認してください。'

/**
 * ブローカーの cookie broker_login の値の職員の ID を staffId に替える。署名があれば、署名は元のまま残す。
 * 改修前の cookie は署名の無い base64url の JSON なので、同じ関数で書き換える。
 */
const forgeStaffId = async (page: Page, staffId: string) => {
  const cookie = (await page.context().cookies()).find((c) => c.name === 'broker_login')
  if (!cookie) throw new Error('cookie broker_login が無い')
  const [body, signature] = cookie.value.split('.')
  const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>
  value.staff_id = staffId
  const forged = Buffer.from(JSON.stringify(value)).toString('base64url')
  await page
    .context()
    .addCookies([{ ...cookie, value: signature === undefined ? forged : `${forged}.${signature}` }])
}

/** 録画の外で職員を登録し、ID とメールを返す。 */
const prepareStaff = async (request: APIRequestContext, label: string) => {
  const staff = newStaff(label)
  const token = await issueManagerToken()
  return { ...staff, id: await registerStaffId(request, token, staff), token }
}

test.describe('予定のカレンダー', () => {
  test.describe('ログインの途中', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}上流の IdP にいる間にブローカーの cookie の職員の ID をほかの職員に替えた場合、ブローカーのログインを続けられない画面が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-forged-cookie',
            title:
              'cookie の職員の ID をほかの職員に替えて上流の IdP から戻ると、ログインを続けられない',
            actor: `${TEAM_MEMBER.name}（1 つ目の事業所のメンバー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(`メールに ${TEAM_MEMBER.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, TEAM_MEMBER.email)
            await expect(idpLogin(page).username).toBeVisible()
            await check('上流の IdP（フェイク）のログインの画面に移る')

            await step(
              `撮影のため、cookie broker_login の職員の ID を ${LOGIN_STAFF.name} の ID に替える`,
            )
            await forgeStaffId(page, LOGIN_STAFF.id)
            await step(`上流の IdP で、本人のメール ${TEAM_MEMBER.email} を確認済みにして入る`)
            await signInAtUpstreamIdp(page, TEAM_MEMBER.email)
            await expect(brokerPage(page).heading.or(page.getByTestId('auth-error'))).toBeVisible()
            await check(
              'コールバックの後に出た画面（期待: ブローカーの「ログインを続けられませんでした」）',
            )
          },
        )
      })

      test(`${prefix}上流の IdP にいる間に職員を退職にした場合、休職と同じ、管理者に確認するよう伝える画面が出ること`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-retired-midway',
            title:
              '上流の IdP にいる間に退職になると、休職と同じ、管理者に確認するよう伝える文が出る',
            actor: 'E2E で登録した職員（1 つ目の事業所のメンバー）',
            variant,
          },
          async (page) => {
            await openWeb(page)
            return prepareStaff(request, 'retired-midway')
          },
          async ({ page, step, check }, staff) => {
            await page.goto('/schedule')
            await step(`メールに ${staff.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, staff.email)
            await expect(idpLogin(page).username).toBeVisible()
            await check('上流の IdP（フェイク）のログインの画面に移る')

            await step('撮影のため、予定の API でこの職員を退職にする')
            expect((await retireStaff(request, staff.token, staff.id)).status()).toBe(200)
            await step('上流の IdP で、同じメールを確認済みにして入る')
            await signInAtUpstreamIdp(page, staff.email)
            await expect(page.getByTestId('auth-error')).toBeVisible()
            await check(`web のログインの失敗の画面の文（期待: 「${DENIED_MESSAGE}」）`)
          },
        )
      })

      test(`${prefix}上流の IdP にいる間に職員を休職にした場合、管理者に確認するよう伝える画面が出ること`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-suspended-midway',
            title: '上流の IdP にいる間に休職になると、管理者に確認するよう伝える文が出る',
            actor: 'E2E で登録した職員（1 つ目の事業所のメンバー）',
            variant,
          },
          async (page) => {
            await openWeb(page)
            return prepareStaff(request, 'suspended-midway')
          },
          async ({ page, step, check }, staff) => {
            await page.goto('/schedule')
            await step(`メールに ${staff.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, staff.email)
            await expect(idpLogin(page).username).toBeVisible()
            await check('上流の IdP（フェイク）のログインの画面に移る')

            await step('撮影のため、予定の API でこの職員を休職にする')
            expect((await leaveStaff(request, staff.token, staff.id)).status()).toBe(200)
            await step('上流の IdP で、同じメールを確認済みにして入る')
            await signInAtUpstreamIdp(page, staff.email)
            await expect(page.getByTestId('auth-error')).toContainText(DENIED_MESSAGE)
            await check(`web のログインの失敗の画面に「${DENIED_MESSAGE}」が出る`)
          },
        )
      })
    }
  })
})
