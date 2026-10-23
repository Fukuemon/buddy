import { expect, test, type Page } from '@playwright/test'

import {
  BASE_URL,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  OFFICE_A_SCHEDULE,
  OFFICE_B,
  TEAM_MEMBER,
} from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { brokerLogin, idpLogin } from '../../selectors/idp'

/** 録画の外では、ログインせずに web の origin を開いておく。録画の中で、ログインの画面から操作する。 */
const openWeb = async (page: Page) => {
  await page.goto(`${BASE_URL}/auth/error`)
}

/** ブローカーのログインの画面で email を入れて次へ進む。 */
const enterEmail = async (page: Page, email: string) => {
  const broker = brokerLogin(page)
  await broker.email.fill(email)
  await broker.next.click()
}

/** 上流の IdP のフェイクで、email を確認済みのクレームにして入る。 */
const signInUpstream = async (page: Page, email: string) => {
  const idp = idpLogin(page)
  await idp.username.fill(email.split('@')[0])
  await idp.claims.fill(JSON.stringify({ email, email_verified: true }))
  await idp.signIn.click()
}

const DAY = `/schedule?view=day&date=${OFFICE_A_SCHEDULE.date}`

/** 録画の外で、予定のカレンダーを開いてログインしておく。 */
const signIn = async (page: Page) => {
  await page.goto(DAY)
  await signInAtBroker(page, LOGIN_EMAIL)
  await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
}

test.describe('予定のカレンダー', () => {
  test.describe('ログイン', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}登録した職員のメールで事業所の上流の IdP に入った場合、予定のカレンダーにその事業所の予定が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-office-a',
            title:
              '登録した職員のメールで、その事業所の上流の IdP に入ると、予定のカレンダーに事業所の予定が出る',
            actor: `${LOGIN_STAFF.name}（1 つ目の事業所のマネージャー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('予定のカレンダーを開くと、ブローカーのメールの入力の画面に移る')

            await step(`メールに ${LOGIN_EMAIL} を入れて「次へ」を押す`)
            await enterEmail(page, LOGIN_EMAIL)
            await expect(idpLogin(page).username).toBeVisible()
            await check('1 つ目の事業所の上流の IdP（フェイク）のログインの画面に移る')

            await step('上流の IdP で、同じメールを確認済みにして入る')
            await signInUpstream(page, LOGIN_EMAIL)
            await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
            await expect(
              page.getByTestId(/^schedule-event-/).filter({ hasText: OFFICE_A_SCHEDULE.title }),
            ).toBeVisible()
            await check(
              `予定のカレンダーに戻り、1 つ目の事業所の予定「${OFFICE_A_SCHEDULE.title}」が出る`,
            )
          },
        )
      })

      test(`${prefix}2 つ目の事業所の職員のメールで入った場合、その事業所の予定だけが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-office-b',
            title: '2 つ目の事業所の職員でログインすると、2 つ目の事業所の予定だけが出る',
            actor: `${OFFICE_B.staff.name}（2 つ目の事業所のマネージャー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(`メールに ${OFFICE_B.email} を入れて「次へ」を押す`)
            await enterEmail(page, OFFICE_B.email)
            await expect(idpLogin(page).username).toBeVisible()
            await check('2 つ目の事業所の上流の IdP（フェイク）のログインの画面に移る')

            await step('上流の IdP で、同じメールを確認済みにして入る')
            await signInUpstream(page, OFFICE_B.email)
            await expect(page.getByTestId('viewer-menu')).toContainText(OFFICE_B.staff.name)
            const events = page.getByTestId(/^schedule-event-/)
            await expect(events.filter({ hasText: OFFICE_B.schedule.title })).toBeVisible()
            await expect(events.filter({ hasText: OFFICE_A_SCHEDULE.title })).toHaveCount(0)
            await check(
              `2 つ目の事業所の予定「${OFFICE_B.schedule.title}」だけが出て、同じ日の 1 つ目の事業所の予定「${OFFICE_A_SCHEDULE.title}」は出ない`,
            )
          },
        )
      })

      test(`${prefix}登録していないメールを入れた場合、事業所を示さずにログインの失敗の画面が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-unregistered-email',
            title: '登録していないメールを入れると、事業所を示さず、ログインの失敗と同じ文言が出る',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step('登録していないメール nobody@example.com を入れて「次へ」を押す')
            await enterEmail(page, 'nobody@example.com')
            await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
            await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
            await check(
              '上流の IdP へ移らず、web のログインの失敗の画面に「ログインできませんでした」が出る',
            )
          },
        )
      })

      test(`${prefix}上流の IdP のメールが入れたメールと違う場合、ログインの失敗の画面が出てログインしていないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'login-upstream-email-mismatch',
            title:
              '上流の IdP のメールが入れたメールと違うと、ログインの失敗の画面が出て、トークンを受け取らない',
            actor: `${TEAM_MEMBER.name}（1 つ目の事業所のメンバー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await step(`メールに ${TEAM_MEMBER.email} を入れて「次へ」を押す`)
            await enterEmail(page, TEAM_MEMBER.email)
            await expect(idpLogin(page).username).toBeVisible()

            await step('上流の IdP で、別のメール someone.else@example.com を確認済みにして入る')
            await signInUpstream(page, 'someone.else@example.com')
            await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
            await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
            await check('web のログインの失敗の画面に「ログインできませんでした」が出る')

            await step('予定のカレンダーを開き直す')
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('セッションが無いので、ブローカーのメールの入力の画面に移る')
          },
        )
      })

      test(`${prefix}ログアウトした後に、もう一度ログインしようとした場合、ブローカーのメールの入力の画面が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'logout-relogin',
            title:
              'ログアウトした後に、もう一度ログインしようとすると、ブローカーのメールの入力の画面が出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
            await step('ログインして、予定のカレンダーを開いている')

            await step('「ログアウト」を押す')
            await page.getByTestId('viewer-logout').click()
            await expect(brokerLogin(page).email).toBeVisible()
            await check('Hydra のログインのセッションが消え、ブローカーのメールの入力の画面に移る')

            await step('もう一度ログインしようとして、予定のカレンダーを開き直す')
            await page.goto(DAY)
            await expect(brokerLogin(page).email).toBeVisible()
            await check('前の職員として入らず、ブローカーのメールの入力の画面が出る')
          },
        )
      })

      test(`${prefix}ログアウトした後に、ブラウザの戻るで前の画面を開いた場合、ログインの画面へ移ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'logout-back',
            title: 'ログアウトした後に、ブラウザの戻るで前の画面を開くと、ログインの画面へ移る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto(DAY)
            await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
            await step('ログインして、予定のカレンダーを開いている')

            await step('「ログアウト」を押す')
            await page.getByTestId('viewer-logout').click()
            await expect(brokerLogin(page).email).toBeVisible()
            await check('ブローカーのメールの入力の画面に移る')

            await step('ブラウザの戻るを押す')
            await page.goBack()
            await expect(brokerLogin(page).email).toBeVisible()
            await expect(page.getByTestId('viewer-menu')).toHaveCount(0)
            await check('前の予定のカレンダーは出ず、ブローカーのメールの入力の画面に移る')
          },
        )
      })
    }
  })
})
