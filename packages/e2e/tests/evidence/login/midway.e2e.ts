import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, TEAM_MEMBER } from '../../fixtures/env'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaffId,
  retireStaff,
} from '../../fixtures/staff'
import { enterEmailAtBroker, signInAtUpstreamIdp } from '../../screens/login'
import { brokerLogin, idpLogin } from '../../selectors/idp'
import { brokerPage } from '../../selectors/broker'

/**
 * ブローカーのシード（services/broker/db/seed/seed.sql）の 青木 陽菜 の職員の ID。予定の API の職員の ID（LOGIN_STAFF.id）とは違う。
 * 改修前に、いる職員の ID に書き換えた結果を示すために使う。
 */
const LOGIN_STAFF_BROKER_ID = '01M5J20JC0TFEK223R3MF68HVK'

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

/** ログインせずに予定のカレンダーを開き、ブローカーのメールの入力の画面が出るまで待つ。 */
const openLogin = async (page: Page) => {
  await page.goto('/schedule')
  await expect(brokerLogin(page).email).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('ログインの途中（ログインなしで始める）', () => {
    test(
      'login-forged-cookie 上流の IdP にいる間にブローカーの cookie の職員の ID をほかの職員に替えた場合、ブローカーのログインを続けられない画面が出ること',
      { tag: '@compare' },
      async ({ page }) => {
        await openLogin(page)
        await intro(
          page,
          `cookie の職員の ID をほかの職員に替えて上流の IdP から戻ると、ログインを続けられない\n前提 ${TEAM_MEMBER.name}（1 つ目の事業所のメンバー）で、ログインせずに予定のカレンダーを開いた`,
        )

        await step(page, `メールに ${TEAM_MEMBER.email} を入れて「次へ」を押す`, () =>
          enterEmailAtBroker(page, TEAM_MEMBER.email),
        )
        await check(page, '上流の IdP（フェイク）のログインの画面に移る', () =>
          expect(idpLogin(page).username).toBeVisible(),
        )

        await step(
          page,
          `撮影のため、cookie broker_login の職員の ID を ${LOGIN_STAFF.name} の ID に替える`,
          () => forgeStaffId(page, LOGIN_STAFF_BROKER_ID),
        )
        await step(
          page,
          `上流の IdP で、本人のメール ${TEAM_MEMBER.email} を確認済みにして入る`,
          () => signInAtUpstreamIdp(page, TEAM_MEMBER.email),
        )
        // 確認する関数は、改修前の web の失敗の画面でも通る。改修前と改修後の判定のスクリーンショットを並べて比べる
        await check(page, 'ブローカーの「ログインを続けられませんでした」の画面が出る', () =>
          expect(brokerPage(page).heading.or(page.getByTestId('auth-error')).first()).toBeVisible(),
        )
      },
    )

    test(
      'login-retired-midway 上流の IdP にいる間に職員を退職にした場合、休職と同じ、管理者に確認するよう伝える画面が出ること',
      { tag: '@compare' },
      async ({ context, request }) => {
        const staff = await prepareStaff(request, 'retired-midway')
        const page = await context.newPage()
        await openLogin(page)
        await intro(
          page,
          '上流の IdP にいる間に退職になると、休職と同じ、管理者に確認するよう伝える文が出る\n前提 録画の前に、1 つ目の事業所のメンバーの職員を登録し、ログインせずに予定のカレンダーを開いた',
        )

        await step(page, `メールに ${staff.email} を入れて「次へ」を押す`, () =>
          enterEmailAtBroker(page, staff.email),
        )
        await check(page, '上流の IdP（フェイク）のログインの画面に移る', () =>
          expect(idpLogin(page).username).toBeVisible(),
        )

        await step(page, '撮影のため、予定の API でこの職員を退職にする', async () => {
          expect((await retireStaff(request, staff.token, staff.id)).status()).toBe(200)
        })
        await step(page, '上流の IdP で、同じメールを確認済みにして入る', () =>
          signInAtUpstreamIdp(page, staff.email),
        )
        // 確認する関数は、改修前の文でも通る。改修前と改修後の判定のスクリーンショットを並べて比べる
        await check(page, `web のログインの失敗の画面に「${DENIED_MESSAGE}」が出る`, () =>
          expect(page.getByTestId('auth-error')).toBeVisible(),
        )
      },
    )

    test('login-suspended-midway 上流の IdP にいる間に職員を休職にした場合、管理者に確認するよう伝える画面が出ること', async ({
      context,
      request,
    }) => {
      const staff = await prepareStaff(request, 'suspended-midway')
      const page = await context.newPage()
      await openLogin(page)
      await intro(
        page,
        '上流の IdP にいる間に休職になると、管理者に確認するよう伝える文が出る\n前提 録画の前に、1 つ目の事業所のメンバーの職員を登録し、ログインせずに予定のカレンダーを開いた',
      )

      await step(page, `メールに ${staff.email} を入れて「次へ」を押す`, () =>
        enterEmailAtBroker(page, staff.email),
      )
      await check(page, '上流の IdP（フェイク）のログインの画面に移る', () =>
        expect(idpLogin(page).username).toBeVisible(),
      )

      await step(page, '撮影のため、予定の API でこの職員を休職にする', async () => {
        expect((await leaveStaff(request, staff.token, staff.id)).status()).toBe(200)
      })
      await step(page, '上流の IdP で、同じメールを確認済みにして入る', () =>
        signInAtUpstreamIdp(page, staff.email),
      )
      await check(page, `web のログインの失敗の画面に「${DENIED_MESSAGE}」が出る`, () =>
        expect(page.getByTestId('auth-error')).toContainText(DENIED_MESSAGE),
      )
    })
  })
})
